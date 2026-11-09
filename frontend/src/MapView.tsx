import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { latLng, loadKakao } from './kakao';
import type { Overlay } from './kakao';
import type { Coordinates, Destination, Store, WalkingRoute } from './types';
import { BrandIcon, Icon, Notice, errorMessage, labels, won } from './ui';

export function MapView({ position, locationError, locating, locate, destination, clear }: {
    position: Coordinates | null; locationError: string; locating: boolean; locate: () => void;
    destination: Destination | null; clear: () => void;
}) {
    const [stores, setStores] = useState<Store[]>([]);
    const [route, setRoute] = useState<WalkingRoute | null>(null);
    const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
    const [reload, setReload] = useState(0); const [mapError, setMapError] = useState('');
    const container = useRef<HTMLDivElement>(null); const centerMap = useRef<(() => void) | null>(null);
    useEffect(() => {
        setRoute(null); setError(''); setStores([]); if (!position) return;
        const controller = new AbortController(); setBusy(true);
        (destination ? api.walking(position, destination, controller.signal).then(setRoute) : api.stores(position, controller.signal).then(setStores))
            .catch(error => { if (!controller.signal.aborted) setError(errorMessage(error)); })
            .finally(() => { if (!controller.signal.aborted) setBusy(false); });
        return () => controller.abort();
    }, [position, destination, reload]);
    useEffect(() => {
        let disposed = false; const overlays: Overlay[] = []; let observer: ResizeObserver | null = null;
        setMapError(''); if (!position || !container.current) return;
        loadKakao().then(maps => {
            if (disposed || !container.current) return;
            const map = new maps.Map(container.current, { center: latLng(maps, position), level: 4 });
            const bounds = new maps.LatLngBounds(); bounds.extend(latLng(maps, position));
            const current = document.createElement('span'); current.className = 'current-dot'; current.setAttribute('aria-label', '내 위치');
            overlays.push(new maps.CustomOverlay({ map, position: latLng(maps, position), content: current, yAnchor: .5, zIndex: 4 }));
            for (const store of destination ? [destination] : stores) {
                const content = document.createElement('div'); content.className = 'map-marker-wrap';
                if (destination) { const label = document.createElement('strong'); label.className = 'map-marker-label'; label.textContent = store.placeName; content.append(label); }
                const marker = document.createElement('span'); marker.className = `map-marker brand-${store.brand.toLowerCase()} ${destination ? 'is-destination' : ''}`;
                marker.textContent = labels[store.brand]; content.append(marker);
                overlays.push(new maps.CustomOverlay({ map, position: latLng(maps, store), content, yAnchor: 1, zIndex: 3 })); bounds.extend(latLng(maps, store));
            }
            if (route && route.path.length > 1) {
                const path = route.path.map(point => { const value = latLng(maps, point); bounds.extend(value); return value; });
                overlays.push(new maps.Polyline({ map, path, strokeWeight: 5, strokeColor: '#111111', strokeOpacity: 1, strokeStyle: 'shortdash' }));
            }
            map.setBounds(bounds, 90, 40, destination ? 250 : 110, 40); centerMap.current = () => map.panTo(latLng(maps, position));
            observer = new ResizeObserver(() => map.relayout()); observer.observe(container.current);
        }).catch(error => { if (!disposed) setMapError(errorMessage(error)); });
        return () => { disposed = true; overlays.forEach(overlay => overlay.setMap(null)); observer?.disconnect(); centerMap.current = null; };
    }, [position, destination, stores, route, reload]);
    const routeUrl = route?.landingUrl && /^https:\/\/(?:map\.kakao\.com|kko\.kakao\.com|kko\.to)(?:\/|$)/.test(route.landingUrl) ? route.landingUrl : null;
    return <section className="map-page" aria-label="주변 편의점 지도"><div ref={container} className="map-canvas" aria-label="카카오맵" />
        {!position && <div className="map-example" aria-hidden="true"><div className="map-park" /><span>성수공원</span></div>}
        {position && <div className="location-pill"><Icon name="pin" size={14} />내 위치 근처</div>}
        <button className="locate-button" aria-label="내 위치로 이동" onClick={() => position && centerMap.current ? centerMap.current() : locate()}><Icon name="locate" size={20} /></button>
        {(!position || locationError) && <div className="location-dialog"><span className="location-symbol"><Icon name="pin-large" size={24} /></span><h1>{locating ? '현재 위치를 확인하고 있어요' : '현재 위치를 확인할 수 없어요'}</h1><p>브라우저 설정에서 위치 접근을 허용하면<br />내 주변 편의점과 가는 길을 보여 드려요.</p><button className="primary" onClick={locate} disabled={locating}>{locating ? '확인 중…' : '다시 시도'}</button><small>위치 정보는 저장하지 않아요</small></div>}
        {position && mapError && <div className="map-error"><Notice retry={() => setReload(value => value + 1)}>{mapError}</Notice></div>}
        {destination ? <div className="destination-card"><div className="destination-title"><BrandIcon code={destination.brand} size={40} /><div><span className="destination-badge">목적지</span><h2>{destination.placeName}</h2></div><button className="icon-button" aria-label="목적지 해제" onClick={clear}><Icon name="map-close" size={20} /></button></div>
            {busy && position ? <p role="status">도보 경로를 불러오고 있어요…</p> : route ? <div className="route-summary"><span>걸어서 <b>{Math.ceil(route.durationSeconds / 60)}</b>분</span><strong>{route.distanceM}m</strong></div> : <p className="route-error" role="status">{position ? error : '현재 위치를 확인하면 도보 경로를 안내해요.'}{error && <button className="retry" onClick={() => setReload(value => value + 1)}>다시 시도</button>}</p>}
            <div className="destination-product"><span>{destination.productName}</span><strong>개당 {won(destination.unitPrice)}원</strong></div>{routeUrl && <a className="external-route" href={routeUrl} target="_blank" rel="noreferrer">카카오맵에서 길찾기</a>}
        </div> : position && <div className="nearby-card">{busy ? <span role="status">주변 편의점을 찾고 있어요…</span> : error ? <Notice retry={() => setReload(value => value + 1)}>{error}</Notice> : <><strong>주변 편의점 {stores.length}곳</strong><small>상품 목록에서 매장을 고르면 길 안내</small></>}</div>}
    </section>;
}


import { useEffect, useRef, useState } from 'react';
import { ApiError, api, fixturesEnabled } from './api';
import { demoCenter, demoCenterLabel, demoMapLabel } from './demoLocation';
import { latLng, loadKakao } from './kakao';
import type { Overlay } from './kakao';
import type { Coordinates, Destination, Store, WalkingRoute } from './types';
import { BrandIcon, Icon, Notice, chipText, errorMessage, fallbackMessage, labels, won } from './ui';

/** M2 경로 실패 문구. 데모는 실제 404가 아니므로 받은 안내를 그대로 쓴다 */
export function routeErrorMessage(error: unknown) {
    if (fixturesEnabled || !(error instanceof ApiError)) return errorMessage(error);
    if (error.status === 404) return '도보 경로를 찾지 못했어요';
    if (error.status === 429) return fallbackMessage;
    if (error.status === 502) return '도보 경로를 불러오지 못했어요';
    return errorMessage(error);
}
function marker(brand: string, kind: 'store' | 'destination' | 'other') {
    const element = document.createElement('span');
    element.className = `map-marker ${kind === 'destination' ? 'is-destination' : kind === 'other' ? 'is-other' : ''}`;
    element.textContent = chipText(brand, kind === 'destination' ? 44 : kind === 'other' ? 24 : 32);
    element.title = labels[brand]; return element;
}
export function MapView({ position, locationError, locating, locate, destination, clear, nearbyStores = [], onStores }: {
    position: Coordinates | null; locationError: string; locating: boolean; locate: () => void;
    destination: Destination | null; clear: () => void;
    /** M1에서 받아 둔 매장. M2에서 다른 매장 마커(24px, 반투명)로만 쓰고 추가 호출은 하지 않는다 */
    nearbyStores?: Store[]; onStores?: (stores: Store[]) => void;
}) {
    const [stores, setStores] = useState<Store[]>([]);
    const [route, setRoute] = useState<WalkingRoute | null>(null);
    const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
    const [reload, setReload] = useState(0); const [mapError, setMapError] = useState('');
    const container = useRef<HTMLDivElement>(null); const centerMap = useRef<(() => void) | null>(null);
    const storesLoaded = useRef(onStores); storesLoaded.current = onStores;
    // 예시 매장은 발표 장소 주변에 고정되어 있으므로 데모에서는 GPS를 지도·경로에 사용하지 않는다.
    const mapPosition = fixturesEnabled ? demoCenter : position;
    useEffect(() => {
        setRoute(null); setError(''); setStores([]); if (!mapPosition) return;
        const controller = new AbortController(); setBusy(true);
        (destination
            ? api.walking(mapPosition, destination, controller.signal).then(setRoute).catch(error => { if (!controller.signal.aborted) setError(routeErrorMessage(error)); })
            : api.stores(mapPosition, controller.signal).then(value => { setStores(value); storesLoaded.current?.(value); }).catch(error => { if (!controller.signal.aborted) setError(errorMessage(error)); }))
            .finally(() => { if (!controller.signal.aborted) setBusy(false); });
        return () => controller.abort();
    }, [mapPosition, destination, reload]);
    useEffect(() => {
        let disposed = false; const overlays: Overlay[] = []; let observer: ResizeObserver | null = null;
        setMapError(''); if (!mapPosition || !container.current) return;
        loadKakao().then(maps => {
            if (disposed || !container.current) return;
            const map = new maps.Map(container.current, { center: latLng(maps, mapPosition), level: 4 });
            const bounds = new maps.LatLngBounds();
            if (!fixturesEnabled) {
                bounds.extend(latLng(maps, mapPosition));
                const current = document.createElement('span'); current.className = 'current-dot'; current.setAttribute('aria-label', '내 위치');
                overlays.push(new maps.CustomOverlay({ map, position: latLng(maps, mapPosition), content: current, yAnchor: .5, zIndex: 4 }));
            }
            if (destination) {
                // 다른 매장: M1에서 받아 둔 것만 낮춰서 표시(표시 범위에는 넣지 않음)
                for (const store of nearbyStores.filter(store => store.storeId !== destination.storeId)) {
                    overlays.push(new maps.CustomOverlay({ map, position: latLng(maps, store), content: marker(store.brand, 'other'), yAnchor: .5, zIndex: 2 }));
                }
            }
            for (const store of destination ? [destination] : stores) {
                const content = document.createElement('div'); content.className = 'map-marker-wrap';
                if (destination) { const label = document.createElement('strong'); label.className = 'map-marker-label'; label.textContent = store.placeName; content.append(label); }
                content.append(marker(store.brand, destination ? 'destination' : 'store'));
                overlays.push(new maps.CustomOverlay({ map, position: latLng(maps, store), content, yAnchor: 1, zIndex: 3 }));
                if (!fixturesEnabled) bounds.extend(latLng(maps, store));
            }
            if (route && route.path.length > 1) {
                const path = route.path.map(point => { const value = latLng(maps, point); if (!fixturesEnabled) bounds.extend(value); return value; });
                // 경로 선 색도 디자인 변수에서 읽는다
                const color = getComputedStyle(document.documentElement).getPropertyValue('--color-text').trim();
                overlays.push(new maps.Polyline({ map, path, strokeWeight: 4, strokeColor: color, strokeOpacity: 1, strokeStyle: fixturesEnabled ? 'shortdash' : 'solid' }));
            }
            if (fixturesEnabled) {
                // 강의장 중심에서 남북·동서 약 500m 범위. GPS·목적지의 원거리 이상값은 줌에 반영하지 않는다.
                bounds.extend(latLng(maps, { x: mapPosition.x - .00567, y: mapPosition.y - .0045 }));
                bounds.extend(latLng(maps, { x: mapPosition.x + .00567, y: mapPosition.y + .0045 }));
                map.setBounds(bounds, 16, 16, 16, 16);
            } else if (destination || stores.length || route?.path.length) {
                map.setBounds(bounds, 90, 40, destination ? 250 : 110, 40);
            }
            centerMap.current = () => map.panTo(latLng(maps, mapPosition));
            observer = new ResizeObserver(() => map.relayout()); observer.observe(container.current);
        }).catch(error => { if (!disposed) setMapError(errorMessage(error)); });
        return () => { disposed = true; overlays.forEach(overlay => overlay.setMap(null)); observer?.disconnect(); centerMap.current = null; };
    }, [mapPosition, destination, stores, route, reload, nearbyStores]);
    const routeUrl = route?.landingUrl && /^https:\/\/(?:map\.kakao\.com|kko\.kakao\.com|kko\.to)(?:\/|$)/.test(route.landingUrl) ? route.landingUrl : null;
    // 경로 성공. path: [] (출발 = 도착)이면 목적지 마커만 두고 분 · 거리 줄은 숨긴다
    const routeOk = !!route;
    return <section className="map-page" aria-label="주변 편의점 지도"><div ref={container} className="map-canvas" aria-label="카카오맵" />
        {!mapPosition && <div className="map-example" aria-hidden="true"><div className="map-park" /></div>}
        {mapPosition && <div className="location-pill"><Icon name="pin" size={14} />{fixturesEnabled ? demoMapLabel : '내 위치 근처'}</div>}
        <button className="locate-button" aria-label={fixturesEnabled ? demoCenterLabel : '내 위치로 이동'} onClick={() => { if (centerMap.current) centerMap.current(); else if (!fixturesEnabled) locate(); }}><Icon name="locate" size={20} /></button>
        {!fixturesEnabled && (!position || locationError) && <div className="location-dialog"><span className="location-symbol"><Icon name="pin-large" size={24} /></span><h1>{locating ? '현재 위치를 확인하고 있어요' : '현재 위치를 확인할 수 없어요'}</h1><p>브라우저 설정에서 위치 접근을 허용하면<br />내 주변 편의점과 가는 길을 보여 드려요.</p><button className="primary" onClick={locate} disabled={locating}>{locating ? '확인 중…' : '다시 시도'}</button><small>위치 정보는 저장하지 않아요</small></div>}
        {mapPosition && mapError && <div className="map-error"><Notice retry={() => setReload(value => value + 1)}>{mapError}</Notice></div>}
        {destination ? <div className="destination-card"><div className="destination-title"><BrandIcon code={destination.brand} size={40} /><div><span className="badge">목적지</span><h2>{destination.placeName}</h2></div><button className="icon-button" aria-label="목적지 해제" onClick={clear}><Icon name="map-close" size={20} /></button></div>
            {fixturesEnabled && routeOk && <p className="route-error">예시 경로 · 실제 길찾기 결과 아님<br /><small>도로 형태 참고 · 출입구·보행 가능 여부 미검증 · 시간·거리 추정<br />도로 자료: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></small></p>}
            {busy && mapPosition ? <div className="route-skeleton" role="status" aria-label="도보 경로를 불러오고 있어요"><span /><span /></div>
                : routeOk ? (route.path.length > 0 && <div className="route-summary"><span>{fixturesEnabled ? '예상 도보 약 ' : '걸어서 '}<b className="mark">{Math.ceil(route.durationSeconds / 60)}</b>분</span><strong>{fixturesEnabled ? '약 ' : ''}{route.distanceM}m</strong></div>)
                : <p className="route-error" role="status">{mapPosition ? error : '현재 위치를 확인하면 도보 경로를 안내해요.'}{error && <button className="text-button" onClick={() => setReload(value => value + 1)}>다시 시도</button>}</p>}
            <div className="destination-product"><span>{destination.productName}</span><strong>개당 {won(destination.unitPrice)}원</strong></div>{routeUrl && <a className="external-route" href={routeUrl} target="_blank" rel="noreferrer">카카오맵에서 길찾기</a>}
        </div> : mapPosition && <div className="nearby-card">{busy ? <span role="status">주변 편의점을 찾고 있어요…</span> : error ? <Notice retry={() => setReload(value => value + 1)}>{error}</Notice> : <><strong>주변 편의점 {stores.length}곳</strong><small>상품 목록에서 매장을 고르면 길 안내</small></>}</div>}
    </section>;
}

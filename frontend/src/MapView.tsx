import { useEffect, useRef, useState } from 'react';
import { ApiError, api, fixturesEnabled } from './api';
import { demoCenter, demoCenterLabel, demoMapLabel } from './demoLocation';
import { latLng, loadKakao } from './kakao';
import type { Overlay } from './kakao';
import { ProductImage } from './Products';
import type { Coordinates, Destination, Product, Store, WalkingRoute } from './types';
import { Icon, Notice, PriceLine, errorMessage, fallbackMessage, labels, logoUrl, won } from './ui';

/** M2 경로 실패 문구. 데모는 실제 404가 아니므로 받은 안내를 그대로 쓴다 */
export function routeErrorMessage(error: unknown) {
    if (fixturesEnabled || !(error instanceof ApiError)) return errorMessage(error);
    if (error.status === 404) return '도보 경로를 찾지 못했어요';
    if (error.status === 429) return fallbackMessage;
    if (error.status === 502) return '도보 경로를 불러오지 못했어요';
    return errorMessage(error);
}
/** 지도 위 말풍선 핀: 로고 + 도보 분(M1) 또는 개당 가격(M2) */
function pin(brand: string, text: string, unit: string, destination = false) {
    const element = document.createElement('span');
    element.className = `map-pin ${destination ? 'is-destination' : ''}`; element.title = labels[brand] ?? '';
    const url = logoUrl(brand);
    if (url) { const image = document.createElement('img'); image.src = url; image.alt = labels[brand] ?? ''; image.className = `lg-${brand.toLowerCase()}`; element.append(image); }
    const value = document.createElement('b'); value.textContent = text;
    const small = document.createElement('small'); small.textContent = unit; value.append(small); element.append(value);
    return element;
}
const arrival = (seconds: number) => new Date(Date.now() + seconds * 1000).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function MapView({ position, locationError, locating, locate, destination, clear, nearbyStores = [], onStores, destinationProduct = null }: {
    position: Coordinates | null; locationError: string; locating: boolean; locate: () => void;
    destination: Destination | null; clear: () => void;
    /** P1 · M1에서 받아 둔 매장. M2에서 다른 매장 핀으로만 쓰고 추가 호출은 하지 않는다 */
    nearbyStores?: Store[]; onStores?: (stores: Store[]) => void;
    /** 목적지 상품의 검색 결과(있으면 정가 · 사진 · 매장별 가격을 보여 준다) */
    destinationProduct?: Product | null;
}) {
    const [stores, setStores] = useState<Store[]>([]);
    const [route, setRoute] = useState<WalkingRoute | null>(null);
    const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
    const [reload, setReload] = useState(0); const [mapError, setMapError] = useState('');
    const container = useRef<HTMLDivElement>(null); const centerMap = useRef<(() => void) | null>(null);
    const destinationCard = useRef<HTMLDivElement>(null);
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
                // 다른 매장: 이미 받아 둔 매장만, 이 상품 가격이 있으면 가격으로(표시 범위에는 넣지 않음)
                const priced = destinationProduct?.stores ?? [];
                const others = (priced.length ? priced : nearbyStores).filter(store => store.storeId !== destination.storeId);
                for (const store of others) {
                    const price = 'unitPrice' in store ? store.unitPrice as number : null;
                    overlays.push(new maps.CustomOverlay({ map, position: latLng(maps, store), content: price === null ? pin(store.brand, String(store.walkMin), '분') : pin(store.brand, won(price), '원'), yAnchor: 1, zIndex: 2 }));
                }
                overlays.push(new maps.CustomOverlay({ map, position: latLng(maps, destination), content: pin(destination.brand, won(destination.unitPrice), '원', true), yAnchor: 1, zIndex: 3 }));
                if (!fixturesEnabled) bounds.extend(latLng(maps, destination));
            } else {
                for (const store of stores) {
                    overlays.push(new maps.CustomOverlay({ map, position: latLng(maps, store), content: pin(store.brand, String(store.walkMin), '분'), yAnchor: 1, zIndex: 3 }));
                    if (!fixturesEnabled) bounds.extend(latLng(maps, store));
                }
            }
            if (route && route.path.length > 1) {
                const path = route.path.map(point => { const value = latLng(maps, point); if (!fixturesEnabled) bounds.extend(value); return value; });
                // 경로 선: 아래 파랑 굵기 8, 위 노랑 굵기 4.5. 데모 예시 경로는 위 선을 점선으로 구분한다
                overlays.push(new maps.Polyline({ map, path, strokeWeight: 8, strokeColor: cssVar('--color-main'), strokeOpacity: 1, strokeStyle: 'solid' }));
                overlays.push(new maps.Polyline({ map, path, strokeWeight: 4.5, strokeColor: cssVar('--color-way'), strokeOpacity: 1, strokeStyle: fixturesEnabled ? 'shortdash' : 'solid' }));
            }
            const fitDemoRoute = () => {
                if (!destination || !route || route.path.length < 2) return false;
                const points = [mapPosition, destination, ...route.path];
                const xs = points.map(point => point.x); const ys = points.map(point => point.y);
                const minX = Math.min(...xs); const maxX = Math.max(...xs);
                const minY = Math.min(...ys); const maxY = Math.max(...ys);
                const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
                // 약 80m 이상을 확보해 아주 짧은 경로도 과도하게 확대하지 않는다.
                const halfX = Math.max((maxX - minX) / 2, 40 / (111320 * Math.cos(center.y * Math.PI / 180)));
                const halfY = Math.max((maxY - minY) / 2, 40 / 111320);
                const routeBounds = new maps.LatLngBounds();
                routeBounds.extend(latLng(maps, { x: Math.min(minX, center.x - halfX), y: Math.min(minY, center.y - halfY) }));
                routeBounds.extend(latLng(maps, { x: Math.max(maxX, center.x + halfX), y: Math.max(maxY, center.y + halfY) }));
                const cardHeight = destinationCard.current?.getBoundingClientRect().height ?? 0;
                // 상단 위치 표시·목적지 핀과 하단 시트(+ 여유 24px)를 피한다.
                map.setBounds(routeBounds, 96, 48, Math.ceil(cardHeight) + 40, 48);
                return true;
            };
            if (fixturesEnabled && !fitDemoRoute()) {
                // 강의장 중심에서 남북·동서 약 500m 범위. GPS·목적지의 원거리 이상값은 줌에 반영하지 않는다.
                bounds.extend(latLng(maps, { x: mapPosition.x - .00567, y: mapPosition.y - .0045 }));
                bounds.extend(latLng(maps, { x: mapPosition.x + .00567, y: mapPosition.y + .0045 }));
                map.setBounds(bounds, 16, 16, 16, 16);
            } else if (!fixturesEnabled && (destination || stores.length || route?.path.length)) {
                map.setBounds(bounds, 90, 40, destination ? 250 : 110, 40);
            }
            centerMap.current = () => {
                if (!fixturesEnabled || !fitDemoRoute()) map.panTo(latLng(maps, mapPosition));
            };
            observer = new ResizeObserver(() => {
                map.relayout();
                if (fixturesEnabled) fitDemoRoute();
            });
            observer.observe(container.current);
            if (fixturesEnabled && destinationCard.current) observer.observe(destinationCard.current);
        }).catch(error => { if (!disposed) setMapError(errorMessage(error)); });
        return () => { disposed = true; overlays.forEach(overlay => overlay.setMap(null)); observer?.disconnect(); centerMap.current = null; };
    }, [mapPosition, destination, stores, route, reload, nearbyStores, destinationProduct]);
    const routeUrl = route?.landingUrl && /^https:\/\/(?:map\.kakao\.com|kko\.kakao\.com|kko\.to)(?:\/|$)/.test(route.landingUrl) ? route.landingUrl : null;
    const minutes = route ? Math.ceil(route.durationSeconds / 60) : 0;
    return <section className="map-page" aria-label="주변 편의점 지도"><div ref={container} className="map-canvas" aria-label="카카오맵" />
        {!mapPosition && <div className="map-example" aria-hidden="true"><div className="map-park" /></div>}
        {mapPosition && <div className="location-pill"><Icon name="icons/map-pin" size={14} />{fixturesEnabled ? demoMapLabel : '내 위치 근처'}</div>}
        <button className={`locate-button ${destination ? 'up' : ''}`} aria-label={fixturesEnabled ? demoCenterLabel : '내 위치로 이동'} onClick={() => { if (centerMap.current) centerMap.current(); else if (!fixturesEnabled) locate(); }}><Icon name="icons/crosshair-simple" size={18} /></button>
        {!fixturesEnabled && (!position || locationError) && <div className="location-dialog"><span className="location-symbol"><Icon name="icons/map-pin-fill" size={24} /></span><h1>{locating ? '현재 위치를 확인하고 있어요' : '현재 위치를 확인할 수 없어요'}</h1><p>브라우저 설정에서 위치 접근을 허용하면<br />내 주변 편의점과 가는 길을 보여 드려요.</p><button className="primary" onClick={locate} disabled={locating}>{locating ? '확인 중…' : '다시 시도'}</button><small>위치 정보는 저장하지 않아요</small></div>}
        {mapPosition && mapError && <div className="map-error"><Notice retry={() => setReload(value => value + 1)}>{mapError}</Notice></div>}
        {destination ? <div ref={destinationCard} className="destination-card"><i className="handle" />
            <div className="route-head"><div><small><span>{destination.placeName}</span>까지</small>
                {busy && mapPosition ? <div className="route-skeleton" role="status" aria-label="도보 경로를 불러오고 있어요"><span /><span /></div>
                    : route ? (route.path.length > 0 && <p className="route-summary"><b>{fixturesEnabled ? '예상 ' : ''}도보 {minutes}분</b><span>{fixturesEnabled ? '약 ' : ''}{route.distanceM}m{fixturesEnabled ? '' : ` · ${arrival(route.durationSeconds)} 도착`}</span></p>)
                    : <p className="route-error" role="status">{mapPosition ? error : '현재 위치를 확인하면 도보 경로를 안내해요.'}</p>}
            </div><button className="icon-button" aria-label="목적지 해제" onClick={clear}><Icon name="icons/x" size={20} /></button></div>
            {fixturesEnabled && route && <p className="route-note">예시 경로 · 실제 길찾기 결과 아님 · 도로 형태 참고 · 출입구·보행 가능 여부 미검증 · 시간·거리 추정 · 도로 자료 <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></p>}
            <div className="destination-product"><ProductImage imageUrl={destinationProduct?.imageUrl ?? null} productKey={destination.productKey} className="s" /><span className="product-info"><small>사러 가는 상품</small><strong>{destination.productName}</strong></span><PriceLine price={destination.unitPrice} listPrice={destinationProduct?.listPrice} size="row" /></div>
            {!busy && !route && error && <button className="secondary" onClick={() => setReload(value => value + 1)}>다시 시도</button>}
            {routeUrl && <a className="external-route" href={routeUrl} target="_blank" rel="noreferrer">카카오맵에서 길찾기</a>}
        </div> : mapPosition && <div className="nearby-card"><i className="handle" />{busy ? <span role="status">주변 편의점을 찾고 있어요…</span> : error ? <Notice retry={() => setReload(value => value + 1)}>{error}</Notice> : <><strong>주변 편의점 {stores.length}곳</strong><small>상품을 검색하면 매장별 가격과 길을 보여 드려요</small></>}</div>}
    </section>;
}

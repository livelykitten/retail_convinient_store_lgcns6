import type { Coordinates } from './types';
export interface MapInstance { setBounds(bounds: Bounds, top?: number, right?: number, bottom?: number, left?: number): void; relayout(): void; panTo(point: LatLng): void }
export interface LatLng { getLat(): number; getLng(): number }
export interface Bounds { extend(point: LatLng): void }
export interface Overlay { setMap(map: MapInstance | null): void }
export interface KakaoMaps {
    load(callback: () => void): void;
    LatLng: new (latitude: number, longitude: number) => LatLng;
    LatLngBounds: new () => Bounds;
    Map: new (container: HTMLElement, options: { center: LatLng; level: number }) => MapInstance;
    CustomOverlay: new (options: { map: MapInstance; position: LatLng; content: HTMLElement; yAnchor?: number; zIndex?: number }) => Overlay;
    Polyline: new (options: { map: MapInstance; path: LatLng[]; strokeWeight: number; strokeColor: string; strokeOpacity: number; strokeStyle: string }) => Overlay;
}
declare global { interface Window { kakao?: { maps: KakaoMaps } } }
let loading: Promise<KakaoMaps> | null = null;
export function loadKakao(): Promise<KakaoMaps> {
    if (loading) return loading;
    const key = import.meta.env.VITE_KAKAO_JAVASCRIPT_KEY;
    if (!key) return Promise.reject(new Error('지도를 표시하려면 카카오맵 설정이 필요해요.'));
    loading = new Promise<KakaoMaps>((resolve, reject) => {
        const script = document.createElement('script'); let finished = false;
        const timeout = window.setTimeout(() => fail(), 15000);
        function fail() {
            if (finished) return; finished = true; window.clearTimeout(timeout); script.remove();
            reject(new Error('지도를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.'));
        }
        function ready() {
            if (!window.kakao) { fail(); return; }
            window.kakao.maps.load(() => { if (finished) return; finished = true; window.clearTimeout(timeout); resolve(window.kakao!.maps); });
        }
        if (window.kakao?.maps) ready();
        else { script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`; script.async = true; script.onload = ready; script.onerror = fail; document.head.append(script); }
    }).catch(error => { loading = null; throw error; });
    return loading;
}
// SDK는 위도·경도, API는 x(경도)·y(위도) 순서다.
export function latLng(maps: KakaoMaps, point: Coordinates): LatLng { return new maps.LatLng(point.y, point.x); }

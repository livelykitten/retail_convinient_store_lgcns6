import type { Coordinates } from './types';

// API 명세의 예시 교육장 좌표. 지도 권한 실패를 이 좌표로 숨기지 않는다.
export const searchDefaultCoordinates: Coordinates = { x: 127.0563, y: 37.5446 };
/** 목적지로 걷는 동안 위치를 계속 받는다(매장 30m 안 자동 시트용). 멈추는 함수를 돌려준다 */
export function watchLocation(next: (value: Coordinates) => void): () => void {
    if (!navigator.geolocation?.watchPosition) return () => {};
    const id = navigator.geolocation.watchPosition(value => next({ x: value.coords.longitude, y: value.coords.latitude }), () => {}, { enableHighAccuracy: true, maximumAge: 5000 });
    return () => navigator.geolocation.clearWatch(id);
}
/** 두 좌표 사이 직선거리(m) */
export function distanceM(a: Coordinates, b: Coordinates) {
    const rad = (value: number) => value * Math.PI / 180;
    const h = Math.sin(rad(b.y - a.y) / 2) ** 2 + Math.cos(rad(a.y)) * Math.cos(rad(b.y)) * Math.sin(rad(b.x - a.x) / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(h));
}
export function getCurrentLocation(): Promise<Coordinates> {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) { reject(new Error('현재 위치를 확인할 수 없어요')); return; }
        navigator.geolocation.getCurrentPosition(
            value => resolve({ x: value.coords.longitude, y: value.coords.latitude }),
            () => reject(new Error('현재 위치를 확인할 수 없어요. 브라우저의 위치 권한을 확인해 주세요.')),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
        );
    });
}

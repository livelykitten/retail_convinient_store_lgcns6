import type { Coordinates } from './types';

// API 명세의 예시 교육장 좌표. 지도 권한 실패를 이 좌표로 숨기지 않는다.
export const searchDefaultCoordinates: Coordinates = { x: 127.0563, y: 37.5446 };
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

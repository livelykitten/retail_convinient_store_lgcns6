import { demoCenter } from './demoLocation';
import { stores } from './fixtures';
import type { Coordinates, WalkingRoute } from './types';

// OpenStreetMap 도로 중심선 참고, 2026-11-09 조회. 실제 길찾기/보행 가능 여부는 미검증.
// https://www.openstreetmap.org/way/420089386 (다산로36길)
// https://www.openstreetmap.org/way/420092888 (청구로4길)
// https://www.openstreetmap.org/way/381802870 (다산로34길)
// 건물 대표 좌표 ↔ 도로 연결 구간은 출입구를 검증하지 않은 발표용 보간이다.
const junction = { x: 127.0159968, y: 37.5627711 };
const southeast = { x: 127.0164076, y: 37.5624598 };
const south = { x: 127.0159654, y: 37.5617083 };
const roadPoints: Coordinates[][] = [
    [junction, { x: 127.0161, y: 37.5626929 }],
    [junction, southeast, south, { x: 127.0161509, y: 37.5616402 }],
    [junction, southeast, { x: 127.0168121, y: 37.5621455 },
        { x: 127.0172489, y: 37.5618272 }, { x: 127.0176554, y: 37.5615174 }]
];

function segmentDistance(a: Coordinates, b: Coordinates) {
    const radians = (value: number) => value * Math.PI / 180;
    const h = Math.sin(radians(b.y - a.y) / 2) ** 2
        + Math.cos(radians(a.y)) * Math.cos(radians(b.y)) * Math.sin(radians(b.x - a.x) / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
const samePoint = (a: Coordinates, b: Coordinates) => Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;

/** 3개 고정 목적지만 제공. 알 수 없는 좌표를 임의 경로로 연결하지 않는다. */
export function demoWalking(start: Coordinates, end: Coordinates): WalkingRoute | null {
    const index = stores.findIndex(store => samePoint(store, end));
    if (!samePoint(start, demoCenter) || index < 0) return null;
    const path = [{ ...demoCenter }, ...roadPoints[index].map(point => ({ ...point })),
        { x: stores[index].x, y: stores[index].y }];
    const distanceM = Math.round(path.slice(1).reduce((sum, point, i) => sum + segmentDistance(path[i], point), 0));
    // 선 길이와 분당 67m를 사용한 가상 추정. 경로 API 결과가 아니다.
    return { path, distanceM, durationSeconds: Math.ceil(distanceM / 67) * 60, landingUrl: null };
}

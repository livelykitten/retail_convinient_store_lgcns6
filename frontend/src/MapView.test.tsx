// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { api, ApiError } from './api';
import { MapView } from './MapView';
import { loadKakao } from './kakao';
import type { KakaoMaps } from './kakao';
import { stores } from './fixtures';
import { searchDefaultCoordinates } from './location';

const mode = vi.hoisted(() => ({ demo: true }));
vi.mock('./api', async importOriginal => ({
    ...await importOriginal<typeof import('./api')>(),
    get fixturesEnabled() { return mode.demo; }
}));
vi.mock('./kakao', async importOriginal => ({
    ...await importOriginal<typeof import('./kakao')>(), loadKakao: vi.fn()
}));

class Point {
    constructor(public latitude: number, public longitude: number) {}
    getLat() { return this.latitude; }
    getLng() { return this.longitude; }
}
class MapBounds {
    points: Point[] = [];
    extend(point: Point) { this.points.push(point); }
}
const created = vi.fn();
const setBounds = vi.fn();
const panTo = vi.fn();
const overlay = vi.fn();
const polyline = vi.fn();
const sdk: KakaoMaps = {
    load: callback => callback(), LatLng: Point, LatLngBounds: MapBounds,
    Map: class {
        constructor(...args: unknown[]) { created(...args); }
        setBounds = setBounds;
        panTo = panTo;
        relayout() {}
    },
    CustomOverlay: class {
        constructor(options: unknown) { overlay(options); }
        setMap() {}
    },
    Polyline: class {
        constructor(options: unknown) { polyline(options); }
        setMap() {}
    }
};
const farGps = { x: 153.0251, y: -27.4698 };
const destination = { ...stores[0], productKey: 'milk', productName: '우유', unitPrice: 1000 };
const props = {
    position: farGps, locationError: '', locating: false,
    locate: vi.fn(), destination: null, clear: vi.fn()
};

beforeEach(() => {
    mode.demo = true;
    vi.clearAllMocks();
    vi.mocked(loadKakao).mockResolvedValue(sdk);
    vi.spyOn(api, 'stores').mockResolvedValue(stores);
    vi.spyOn(api, 'walking').mockRejectedValue(new ApiError(
        'ROUTE_NOT_FOUND', '개발 예시 모드에서는 실제 도보 경로를 제공하지 않아요', 404
    ));
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('지도 좌표와 표시 범위 분리', () => {
    it('원거리 GPS가 있어도 성수동 중심 약 500m 반경만 bounds에 넣는다', async () => {
        render(<MapView {...props} />);
        await waitFor(() => expect(setBounds).toHaveBeenCalled());
        expect(api.stores).toHaveBeenCalledWith(searchDefaultCoordinates, expect.any(AbortSignal));
        for (const [, options] of created.mock.calls) {
            expect(options.center.getLng()).toBe(searchDefaultCoordinates.x);
            expect(options.center.getLat()).toBe(searchDefaultCoordinates.y);
        }
        for (const [bounds, ...padding] of setBounds.mock.calls) {
            expect(bounds.points).toEqual([
                new Point(searchDefaultCoordinates.y - .0045, searchDefaultCoordinates.x - .00567),
                new Point(searchDefaultCoordinates.y + .0045, searchDefaultCoordinates.x + .00567)
            ]);
            expect(padding).toEqual([16, 16, 16, 16]);
        }
        expect(screen.getByText('성수동 예시 지도 · 실제 내 위치 아님')).toBeTruthy();
        expect(overlay.mock.calls.some(([options]) => options.content.className === 'current-dot')).toBe(false);
        fireEvent.click(screen.getByRole('button', { name: '성수동 예시 중심으로 이동' }));
        expect(panTo).toHaveBeenLastCalledWith(new Point(searchDefaultCoordinates.y, searchDefaultCoordinates.x));
        expect(props.locate).not.toHaveBeenCalled();
    });

    it('GPS 권한이 없어도 예시 지도를 표시하고 가짜 경로를 그리지 않는다', async () => {
        render(<MapView {...props} position={null} locationError="위치 거부" destination={destination} />);
        await screen.findByText('개발 예시 모드에서는 실제 도보 경로를 제공하지 않아요');
        await waitFor(() => expect(setBounds).toHaveBeenCalled());
        expect(api.walking).toHaveBeenCalledWith(searchDefaultCoordinates, destination, expect.any(AbortSignal));
        expect(screen.queryByText('현재 위치를 확인할 수 없어요')).toBeNull();
        expect(screen.getByText(destination.placeName)).toBeTruthy();
        expect(polyline).not.toHaveBeenCalled();
    });

    it('예시 목적지의 이상 좌표도 표시 범위를 넓히지 않는다', async () => {
        render(<MapView {...props} destination={{ ...destination, ...farGps }} />);
        await waitFor(() => expect(setBounds).toHaveBeenCalled());
        for (const [bounds] of setBounds.mock.calls) {
            expect(bounds.points).toHaveLength(2);
            expect(bounds.points.every((point: Point) =>
                Math.abs(point.getLat() - searchDefaultCoordinates.y) < .005
                && Math.abs(point.getLng() - searchDefaultCoordinates.x) < .006)).toBe(true);
        }
    });

    it('실제 API 모드는 GPS·실제 매장으로 bounds와 내 위치 마커를 만든다', async () => {
        mode.demo = false;
        render(<MapView {...props} />);
        await waitFor(() => expect(setBounds.mock.calls.some(([bounds]) => bounds.points.length > 1)).toBe(true));
        expect(api.stores).toHaveBeenCalledWith(farGps, expect.any(AbortSignal));
        expect(created.mock.calls[0][1].center).toEqual(new Point(farGps.y, farGps.x));
        expect(setBounds.mock.calls.at(-1)![0].points).toEqual([
            new Point(farGps.y, farGps.x), ...stores.map(store => new Point(store.y, store.x))
        ]);
        expect(overlay.mock.calls.some(([options]) => options.content.className === 'current-dot')).toBe(true);
        expect(screen.getByText('내 위치 근처')).toBeTruthy();
    });

    it('실제 API 모드에서 매장·경로가 없으면 단일 GPS로 setBounds를 호출하지 않는다', async () => {
        mode.demo = false;
        vi.mocked(api.stores).mockResolvedValue([]);
        render(<MapView {...props} />);
        await screen.findByText('주변 편의점 0곳');
        await waitFor(() => expect(created).toHaveBeenCalled());
        expect(setBounds).not.toHaveBeenCalled();
    });

    it('지도 키·SDK가 없을 때 기존 지도 오류 안내를 유지한다', async () => {
        vi.mocked(loadKakao).mockRejectedValue(new Error('지도를 표시하려면 카카오맵 설정이 필요해요.'));
        render(<MapView {...props} position={null} />);
        expect(await screen.findByText('지도를 표시하려면 카카오맵 설정이 필요해요.')).toBeTruthy();
        expect(polyline).not.toHaveBeenCalled();
    });
});

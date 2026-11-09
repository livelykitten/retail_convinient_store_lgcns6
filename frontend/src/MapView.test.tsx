// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api, ApiError } from './api';
import { MapView } from './MapView';
import App from './App';
import { loadKakao } from './kakao';
import type { KakaoMaps } from './kakao';
import { quotes, stores, walletOptions } from './fixtures';
import { demoCenter } from './demoLocation';
import { demoWalking } from './demoRoutes';

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
    localStorage.clear(); sessionStorage.clear(); sessionStorage.setItem('pyeonri.started', 'true');
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
    it.each(stores)('$placeName 예시 경로 전체를 포함하면서 500m 고정 범위보다 확대한다', async store => {
        const selected = { ...destination, ...store };
        const route = demoWalking(demoCenter, selected)!;
        vi.mocked(api.walking).mockResolvedValue(route);
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
            return { height: this.classList.contains('destination-card') ? 280 : 700 } as DOMRect;
        });
        render(<MapView {...props} destination={selected} />);
        await waitFor(() => expect(polyline).toHaveBeenCalled());
        const [bounds, ...padding] = setBounds.mock.calls.at(-1)!;
        const [southwest, northeast] = bounds.points as Point[];
        for (const point of [demoCenter, selected, ...route.path]) {
            expect(point.x).toBeGreaterThanOrEqual(southwest.getLng());
            expect(point.x).toBeLessThanOrEqual(northeast.getLng());
            expect(point.y).toBeGreaterThanOrEqual(southwest.getLat());
            expect(point.y).toBeLessThanOrEqual(northeast.getLat());
        }
        // 가장 짧은 GS25도 최소 80m 범위로 과확대를 막되, 기존 약 1km 폭보다 좁다.
        expect(northeast.getLat() - southwest.getLat()).toBeGreaterThanOrEqual(80 / 111320 - 1e-10);
        expect(northeast.getLng() - southwest.getLng()).toBeLessThan(.006);
        expect(northeast.getLat() - southwest.getLat()).toBeLessThan(.005);
        expect(padding).toEqual([96, 48, 320, 48]);
        // 중심 이동 버튼도 카드 위에 경로 전체가 들어오는 구도로 복귀한다.
        fireEvent.click(screen.getByRole('button', { name: '신당동 강의장 예시 중심으로 이동' }));
        expect(setBounds.mock.calls.at(-1)!.slice(1)).toEqual(padding);
        expect(panTo).not.toHaveBeenCalled();
    });

    it('카드 크기 변경 시 실제 높이를 다시 측정하고 목적지 해제 시 500m 범위로 복원한다', async () => {
        const resizeCallbacks: (() => void)[] = [];
        const observed: Element[] = [];
        vi.stubGlobal('ResizeObserver', class {
            constructor(callback: () => void) { resizeCallbacks.push(callback); }
            observe(element: Element) { observed.push(element); }
            disconnect() {}
        });
        let cardHeight = 200;
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
            return { height: this.classList.contains('destination-card') ? cardHeight : 700 } as DOMRect;
        });
        vi.mocked(api.walking).mockResolvedValue(demoWalking(demoCenter, destination)!);
        const view = render(<MapView {...props} destination={destination} />);
        await waitFor(() => expect(polyline).toHaveBeenCalled());
        expect(setBounds.mock.calls.at(-1)![3]).toBe(240);
        expect(observed.some(element => element.classList.contains('destination-card'))).toBe(true);
        cardHeight = 310;
        act(() => resizeCallbacks.at(-1)!());
        expect(setBounds.mock.calls.at(-1)![3]).toBe(350);
        view.rerender(<MapView {...props} destination={null} />);
        await waitFor(() => expect(setBounds.mock.calls.at(-1)!.slice(1)).toEqual([16, 16, 16, 16]));
        expect(setBounds.mock.calls.at(-1)![0].points).toEqual([
            new Point(demoCenter.y - .0045, demoCenter.x - .00567),
            new Point(demoCenter.y + .0045, demoCenter.x + .00567)
        ]);
    });
    it('데모 할인 등록·삭제가 기존 검색의 가격·추천과 저장 목적지 가격에 반영된다', async () => {
        Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function(this: HTMLDialogElement) { this.open = true; } });
        Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function(this: HTMLDialogElement) { this.open = false; } });
        vi.spyOn(api, 'quotes').mockImplementation(async input => quotes(input));
        vi.spyOn(api, 'walletOptions').mockResolvedValue(walletOptions);
        vi.mocked(api.walking).mockImplementation(async (start, end) => demoWalking(start, end)!);
        const user = userEvent.setup();
        render(<App />);
        await user.type(screen.getByRole('textbox', { name: '상품 검색' }), '우유');
        await user.click(screen.getByRole('button', { name: '검색' }));
        await user.selectOptions(screen.getByRole('combobox', { name: '정렬' }), 'PRICE');
        await user.click(await screen.findByRole('button', { name: /빙그레 바나나맛우유/ }));
        expect(screen.getByText('GS25 신당퍼스트점')).toBeTruthy();
        expect(screen.getByText('가장 싸고 가까워요')).toBeTruthy();
        await user.click(screen.getByRole('button', { name: '할인 수단' }));
        await user.click(screen.getByRole('button', { name: '할인 수단 추가' }));
        const dialog = await screen.findByRole('dialog');
        await user.click(await within(dialog).findByRole('button', { name: 'SKT' }));
        await user.click(within(dialog).getByRole('button', { name: 'VIP' }));
        await user.click(within(dialog).getByRole('button', { name: '추가' }));
        await user.click(screen.getByRole('button', { name: '상품 목록' }));
        expect(await screen.findByText('CU 신당다산로점')).toBeTruthy();
        expect(screen.getByText('가장 싸요')).toBeTruthy();
        expect(screen.getByText(/100원 더 비싸지만 약 1분 가까워요/)).toBeTruthy();
        expect(screen.getAllByText('900').length).toBeGreaterThan(0);
        await user.click(screen.getByRole('button', { name: '여기로 길 안내' }));
        expect(await screen.findByText('개당 900원')).toBeTruthy();
        expect(await screen.findByText('예시 경로 · 실제 길찾기 결과 아님')).toBeTruthy();
        await user.click(screen.getByRole('button', { name: '할인 수단' }));
        await user.click(screen.getByRole('button', { name: 'SKT 삭제' }));
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }));
        await waitFor(() => expect(JSON.parse(sessionStorage.getItem('pyeonri.destination')!).unitPrice).toBe(1200));
        await user.click(screen.getByRole('button', { name: '지도' }));
        expect(await screen.findByText('개당 1,200원')).toBeTruthy();
        await user.click(screen.getByRole('button', { name: '목적지 해제' }));
        await user.click(screen.getByRole('button', { name: '상품 목록' }));
        expect(screen.getByText('GS25 신당퍼스트점')).toBeTruthy();
        expect(screen.getByText('가장 싸고 가까워요')).toBeTruthy();
        expect(screen.queryByText('900')).toBeNull();
    });
    it('이전 데모 목적지를 복원하지 않고 실제 API 모드의 저장값은 유지한다', () => {
        const oldDestination = { ...destination, storeId: '12345678', placeName: '이전 데모 매장' };
        sessionStorage.setItem('pyeonri.destination', JSON.stringify(oldDestination));
        const demo = render(<App />);
        expect(sessionStorage.getItem('pyeonri.destination')).toBeNull();
        demo.unmount();
        mode.demo = false;
        sessionStorage.setItem('pyeonri.destination', JSON.stringify(oldDestination));
        render(<App />);
        expect(JSON.parse(sessionStorage.getItem('pyeonri.destination')!)).toEqual(oldDestination);
    });
    it('원거리 GPS가 있어도 신당동 강의장 중심 약 500m 반경만 bounds에 넣는다', async () => {
        render(<MapView {...props} />);
        await waitFor(() => expect(setBounds).toHaveBeenCalled());
        expect(api.stores).toHaveBeenCalledWith(demoCenter, expect.any(AbortSignal));
        for (const [, options] of created.mock.calls) {
            expect(options.center.getLng()).toBe(demoCenter.x);
            expect(options.center.getLat()).toBe(demoCenter.y);
        }
        for (const [bounds, ...padding] of setBounds.mock.calls) {
            expect(bounds.points).toEqual([
                new Point(demoCenter.y - .0045, demoCenter.x - .00567),
                new Point(demoCenter.y + .0045, demoCenter.x + .00567)
            ]);
            expect(padding).toEqual([16, 16, 16, 16]);
        }
        expect(screen.getByText('신당동 강의장 예시 지도 · 실제 내 위치 아님')).toBeTruthy();
        expect(overlay.mock.calls.some(([options]) => options.content.className === 'current-dot')).toBe(false);
        fireEvent.click(screen.getByRole('button', { name: '신당동 강의장 예시 중심으로 이동' }));
        expect(panTo).toHaveBeenLastCalledWith(new Point(demoCenter.y, demoCenter.x));
        expect(props.locate).not.toHaveBeenCalled();
    });

    it('GPS 권한 없이 고정 예시 경로·시간·거리와 미검증 안내를 표시한다', async () => {
        const route = demoWalking(demoCenter, destination)!;
        vi.mocked(api.walking).mockResolvedValue(route);
        render(<MapView {...props} position={null} locationError="위치 거부" destination={destination} />);
        await screen.findByText('예시 경로 · 실제 길찾기 결과 아님');
        await waitFor(() => expect(setBounds).toHaveBeenCalled());
        expect(api.walking).toHaveBeenCalledWith(demoCenter, destination, expect.any(AbortSignal));
        expect(screen.queryByText('현재 위치를 확인할 수 없어요')).toBeNull();
        expect(screen.getByText(destination.placeName)).toBeTruthy();
        await waitFor(() => expect(polyline).toHaveBeenCalled());
        expect(polyline.mock.calls.at(-1)![0].path).toEqual(route.path.map(point => new Point(point.y, point.x)));
        expect(polyline.mock.calls.at(-1)![0].strokeStyle).toBe('shortdash');
        expect(screen.getByText(`약 ${route.distanceM}m`)).toBeTruthy();
        expect(screen.getByText(/도로 형태 참고 · 출입구·보행 가능 여부 미검증/)).toBeTruthy();
    });

    it('예시 목적지의 이상 좌표도 표시 범위를 넓히지 않는다', async () => {
        render(<MapView {...props} destination={{ ...destination, ...farGps }} />);
        await waitFor(() => expect(setBounds).toHaveBeenCalled());
        for (const [bounds] of setBounds.mock.calls) {
            expect(bounds.points).toHaveLength(2);
            expect(bounds.points.every((point: Point) =>
                Math.abs(point.getLat() - demoCenter.y) < .005
                && Math.abs(point.getLng() - demoCenter.x) < .006)).toBe(true);
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
        expect(setBounds.mock.calls.at(-1)!.slice(1)).toEqual([90, 40, 110, 40]);
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

    it('실제 경로는 기존 GPS·경로 bounds와 하단 250px 여백을 유지한다', async () => {
        mode.demo = false;
        const path = [demoCenter, { x: 127.0164, y: 37.5624 }, { x: destination.x, y: destination.y }];
        vi.mocked(api.walking).mockResolvedValue({ path, distanceM: 100, durationSeconds: 120, landingUrl: null });
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ height: 350 } as DOMRect);
        render(<MapView {...props} position={demoCenter} destination={destination} />);
        await waitFor(() => expect(polyline).toHaveBeenCalled());
        expect(setBounds.mock.calls.at(-1)!.slice(1)).toEqual([90, 40, 250, 40]);
        expect(setBounds.mock.calls.at(-1)![0].points).toEqual([
            new Point(demoCenter.y, demoCenter.x), new Point(destination.y, destination.x),
            ...path.map(point => new Point(point.y, point.x))
        ]);
        expect(polyline.mock.calls.at(-1)![0].strokeStyle).toBe('solid');
    });

    it('지도 키·SDK가 없을 때 기존 지도 오류 안내를 유지한다', async () => {
        vi.mocked(loadKakao).mockRejectedValue(new Error('지도를 표시하려면 카카오맵 설정이 필요해요.'));
        render(<MapView {...props} position={null} />);
        expect(await screen.findByText('지도를 표시하려면 카카오맵 설정이 필요해요.')).toBeTruthy();
        expect(polyline).not.toHaveBeenCalled();
    });
});

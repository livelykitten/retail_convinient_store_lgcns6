// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { api, ApiError } from './api';
import { quotes, stores, walletOptions } from './fixtures';
import { MapView } from './MapView';
import { emptyWallet } from './storage';
import type { KakaoMaps } from './kakao';
import { latLng, loadKakao } from './kakao';

vi.mock('./kakao', async importOriginal => ({ ...await importOriginal<typeof import('./kakao')>(), loadKakao: vi.fn() }));
beforeEach(() => {
    localStorage.clear(); sessionStorage.clear(); sessionStorage.setItem('pyeonri.started', 'true');
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function(this: HTMLDialogElement) { this.open = true; } });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function(this: HTMLDialogElement) { this.open = false; } });
    vi.spyOn(api, 'walletOptions').mockResolvedValue(walletOptions);
    vi.spyOn(api, 'quotes').mockImplementation(async input => quotes(input));
    vi.spyOn(api, 'stores').mockResolvedValue(stores);
    vi.spyOn(api, 'walking').mockRejectedValue(new ApiError('ROUTE_NOT_FOUND', '도보 경로를 찾지 못했어요', 404));
    vi.mocked(loadKakao).mockRejectedValue(new Error('지도 설정이 필요해요'));
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
        getCurrentPosition: vi.fn((_success, failure) => failure({ code: 1 }))
    } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function searchMilk() {
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: '상품 검색' }), '우유');
    await user.click(screen.getByRole('button', { name: '검색' }));
    await screen.findByText('빙그레 바나나맛우유 240ml'); return user;
}
describe('주요 사용자 흐름', () => {
    it('검색·서버 정렬·매장 펼침·재고 표시·목적지 유지가 이어진다', async () => {
        render(<App />); expect(screen.queryByText('빙그레 바나나맛우유 240ml')).toBeNull();
        const user = await searchMilk();
        await user.selectOptions(screen.getByRole('combobox', { name: '정렬' }), 'PRICE');
        await waitFor(() => expect(api.quotes).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'PRICE', wallet: emptyWallet() }), expect.any(AbortSignal)));
        await user.click(await screen.findByRole('button', { name: /빙그레 바나나맛우유/ }));
        // 최적 매장(CU)만 강조 카드로, GS25는 접힌 줄의 차이 문구로
        expect(screen.getByText('가장 싸고 가까워요')).toBeTruthy(); expect(screen.getByText('CU 성수연무장점')).toBeTruthy();
        expect(screen.queryByText('GS25 성수역점')).toBeNull(); expect(screen.getByText(/같은 가격인데 약 2분 더 걸려요/)).toBeTruthy();
        await user.click(screen.getByRole('button', { name: /다른 매장 1곳/ }));
        await user.click(screen.getByRole('button', { name: /GS25 성수역점/ }));
        await screen.findByText('현재 위치를 확인할 수 없어요'); expect(api.walking).not.toHaveBeenCalled();
        expect(JSON.parse(sessionStorage.getItem('pyeonri.destination')!).storeId).toBe('87654321');
        await user.click(screen.getByRole('button', { name: '상품 목록' }));
        // 돌아오면 목적지 상품이 펼쳐져 있고 목적지 매장이 강조 카드에
        expect(screen.getByText('목적지')).toBeTruthy(); expect(screen.getByRole('button', { name: '지도에서 길 보기' })).toBeTruthy();
        expect(screen.getByText(/같은 가격이고 약 2분 가까워요/)).toBeTruthy();
        await user.click(screen.getByRole('button', { name: '지도' }));
        await user.click(screen.getByRole('button', { name: '목적지 해제' }));
        expect(sessionStorage.getItem('pyeonri.destination')).toBeNull();
    });
    it('할인 수단 추가·수정·삭제와 다음 검색 요청 반영', async () => {
        render(<App />); const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: '할인 수단' }));
        await user.click(screen.getByRole('button', { name: '할인 수단 추가' }));
        const dialog = await screen.findByRole('dialog');
        await user.click(await within(dialog).findByRole('button', { name: 'SKT' }));
        await user.click(within(dialog).getByRole('button', { name: 'VIP' }));
        await user.click(within(dialog).getByRole('button', { name: '추가' }));
        expect(JSON.parse(localStorage.getItem('pyeonri.wallet')!).telecom).toEqual({ provider: 'SKT', grade: 'VIP' });
        await user.click(screen.getByRole('button', { name: 'SKT 수정' }));
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '일반' }));
        await user.click(screen.getByRole('button', { name: '수정 완료' }));
        await user.click(screen.getByRole('button', { name: '상품 목록' }));
        await searchMilk();
        expect(api.quotes).toHaveBeenLastCalledWith(expect.objectContaining({ wallet: expect.objectContaining({ telecom: { provider: 'SKT', grade: 'NORMAL' } }) }), expect.any(AbortSignal));
        await user.click(screen.getByRole('button', { name: '할인 수단' }));
        await user.click(screen.getByRole('button', { name: 'SKT 삭제' }));
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }));
        expect(JSON.parse(localStorage.getItem('pyeonri.wallet')!).telecom).toBeNull();
        expect(screen.getByText('아직 등록한 할인 수단이 없어요')).toBeTruthy();
    });
    it('카드 직접 입력을 검증하고 카드사와 이름을 저장한다', async () => {
        render(<App />); const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: '할인 수단' }));
        await user.click(screen.getByRole('button', { name: '할인 수단 추가' }));
        await screen.findByRole('button', { name: /신용·체크카드/ });
        await user.click(screen.getByRole('button', { name: /신용·체크카드/ }));
        await user.click(screen.getByRole('button', { name: '직접 입력' }));
        // 카드 이름 · 카드사를 다 고르기 전에는 「추가」 비활성
        expect((screen.getByRole('button', { name: '추가' }) as HTMLButtonElement).disabled).toBe(true);
        await user.type(screen.getByRole('textbox', { name: '카드 이름' }), '우리카드 카드의정석 체크');
        await user.selectOptions(screen.getByRole('combobox', { name: '카드사' }), 'WOORI');
        await user.click(screen.getByRole('button', { name: '추가' }));
        expect(JSON.parse(localStorage.getItem('pyeonri.wallet')!).cards).toEqual([{ cardId: null, issuer: 'WOORI', name: '우리카드 카드의정석 체크' }]);
    });
    it('저장된 수단과 목적지를 새 마운트에서 복원한다', async () => {
        localStorage.setItem('pyeonri.wallet', JSON.stringify({ ...emptyWallet(), pays: ['KAKAOPAY'] }));
        sessionStorage.setItem('pyeonri.destination', JSON.stringify({ ...stores[0], productKey: 'milk', productName: '우유', unitPrice: 1000 }));
        render(<App />); const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: '할인 수단' })); expect(await screen.findByText('카카오페이')).toBeTruthy();
        await user.click(screen.getByRole('button', { name: '지도' })); expect(screen.getByText('CU 성수연무장점')).toBeTruthy();
    });
    it('검색 실패·재시도·빈 결과를 표시한다', async () => {
        vi.mocked(api.quotes).mockRejectedValueOnce(new Error('검색 실패')).mockResolvedValueOnce({ query: '우유', products: [] });
        render(<App />); const user = userEvent.setup();
        await user.type(screen.getByRole('textbox', { name: '상품 검색' }), '우유');
        await user.click(screen.getByRole('button', { name: '검색' })); expect(await screen.findByText('검색 실패')).toBeTruthy();
        await user.click(screen.getByRole('button', { name: '다시 시도' })); expect(await screen.findByText('검색 결과 없음')).toBeTruthy();
    });
});
describe('경로 지도 계약', () => {
    const destination = { ...stores[0], productKey: 'milk', productName: '우유', unitPrice: 1000 };
    it('성공 응답의 시간·거리와 순서가 있는 경로를 지도에 전달한다', async () => {
        const path = [{ x: 127.0563, y: 37.5446 }, { x: 127.0565, y: 37.5443 }, { x: 127.0571, y: 37.5431 }];
        vi.mocked(api.walking).mockResolvedValue({ path, distanceM: 410, durationSeconds: 390, landingUrl: null });
        const polyline = vi.fn(); const removed = vi.fn();
        class Point { constructor(public latitude: number, public longitude: number) {} getLat() { return this.latitude; } getLng() { return this.longitude; } }
        const maps: KakaoMaps = {
            load: callback => callback(), LatLng: Point,
            LatLngBounds: class { extend() {} },
            Map: class { setBounds() {} relayout() {} panTo() {} },
            CustomOverlay: class { setMap = removed; },
            Polyline: class { constructor(options: unknown) { polyline(options); } setMap = removed; }
        };
        vi.mocked(loadKakao).mockResolvedValue(maps);
        const { unmount } = render(<MapView position={path[0]} destination={destination} locationError="" locating={false} locate={vi.fn()} clear={vi.fn()} />);
        expect(await screen.findByText('410m')).toBeTruthy(); expect(screen.getByText('7')).toBeTruthy();
        await waitFor(() => expect(polyline).toHaveBeenCalled());
        expect(polyline.mock.calls.at(-1)![0].path.map((point: Point) => [point.getLng(), point.getLat()])).toEqual(path.map(point => [point.x, point.y]));
        expect(latLng(maps, path[0]).getLat()).toBe(37.5446); unmount(); expect(removed).toHaveBeenCalledWith(null);
    });
    it('경로 실패에도 목적지와 가격을 유지하고 가짜 시간이나 경로를 만들지 않는다', async () => {
        render(<MapView position={{ x: 127, y: 37 }} destination={destination} locationError="" locating={false} locate={vi.fn()} clear={vi.fn()} />);
        expect(await screen.findByText('도보 경로를 찾지 못했어요')).toBeTruthy(); expect(screen.getByText('CU 성수연무장점')).toBeTruthy(); expect(screen.getByText('개당 1,000원')).toBeTruthy(); expect(screen.queryByText('걸어서')).toBeNull();
    });
    it('출발 = 도착(path: [])이면 분 · 거리 줄을 숨기고 오류도 띄우지 않는다', async () => {
        vi.mocked(api.walking).mockResolvedValue({ path: [], distanceM: 0, durationSeconds: 0, landingUrl: null });
        render(<MapView position={{ x: 127, y: 37 }} destination={destination} locationError="" locating={false} locate={vi.fn()} clear={vi.fn()} />);
        await waitFor(() => expect(api.walking).toHaveBeenCalled());
        await waitFor(() => expect(screen.queryByRole('status', { name: '도보 경로를 불러오고 있어요' })).toBeNull());
        expect(screen.queryByText('걸어서')).toBeNull(); expect(screen.queryByText('0m')).toBeNull(); expect(screen.getByText('CU 성수연무장점')).toBeTruthy();
    });
    it('위치가 없으면 경로를 요청하지 않고 재시도한다', async () => {
        const retry = vi.fn();
        render(<MapView position={null} destination={destination} locationError="거부됨" locating={false} locate={retry} clear={vi.fn()} />);
        expect(api.walking).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: '다시 시도' })); expect(retry).toHaveBeenCalledOnce();
    });
});



// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { api, ApiError } from './api';
import { quotes, stores, walletOptions } from './fixtures';
import { MapView, routeErrorMessage, tooFarMessage } from './MapView';
import { emptyWallet } from './storage';
import type { KakaoMaps } from './kakao';
import { latLng, loadKakao } from './kakao';

const cuStore = stores.find(store => store.brand === 'CU')!;

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
    it('검색 응답을 기다리는 사이 해제한 목적지를 이전 응답으로 복원하지 않는다', async () => {
        render(<App />); const user = await searchMilk();
        await user.click(screen.getByRole('button', { name: /빙그레 바나나맛우유/ }));
        await user.click(screen.getByRole('button', { name: '길찾기' }));
        await user.click(screen.getByRole('button', { name: '상품 목록' }));
        const response = quotes({ q: '우유', x: 127, y: 37, wallet: emptyWallet() });
        let finish!: (value: typeof response) => void;
        vi.mocked(api.quotes).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        await user.selectOptions(screen.getByRole('combobox', { name: '정렬' }), 'PRICE');
        await user.click(screen.getByRole('button', { name: '지도' }));
        await user.click(screen.getByRole('button', { name: '목적지 해제' }));
        expect(sessionStorage.getItem('pyeonri.destination')).toBeNull();
        finish(response);
        await user.click(screen.getByRole('button', { name: '상품 목록' }));
        await screen.findByText('빙그레 바나나맛우유 240ml');
        expect(sessionStorage.getItem('pyeonri.destination')).toBeNull();
        expect(screen.queryByText('목적지')).toBeNull();
    });
    it('실제 API 모드에서도 할인 수단 추가·수정·삭제 후 가격과 선택한 목적지를 자동 갱신한다', async () => {
        render(<App />); const user = await searchMilk();
        await user.click(screen.getByRole('button', { name: /빙그레 바나나맛우유/ }));
        await user.click(screen.getByRole('button', { name: /다른 매장 1곳/ }));
        await user.click(screen.getByRole('button', { name: /CU 신당다산로점/ }));
        const selectedId = JSON.parse(sessionStorage.getItem('pyeonri.destination')!).storeId;
        await user.click(screen.getByRole('button', { name: '할인 수단' }));
        await user.click(screen.getByRole('button', { name: '할인 수단 추가' }));
        const dialog = await screen.findByRole('dialog');
        await user.click(await within(dialog).findByRole('button', { name: 'SKT' }));
        await user.click(within(dialog).getByRole('button', { name: 'VIP' }));
        await user.click(within(dialog).getByRole('button', { name: '추가' }));
        await waitFor(() => expect(JSON.parse(sessionStorage.getItem('pyeonri.destination')!)).toMatchObject({
            storeId: selectedId, unitPrice: 900, methods: [{ type: 'TELECOM', code: 'SKT' }]
        }));
        await user.click(screen.getByRole('button', { name: 'SKT 수정' }));
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '일반' }));
        await user.click(screen.getByRole('button', { name: '수정 완료' }));
        await waitFor(() => expect(api.quotes).toHaveBeenLastCalledWith(expect.objectContaining({
            wallet: expect.objectContaining({ telecom: { provider: 'SKT', grade: 'NORMAL' } })
        }), expect.any(AbortSignal)));
        await user.click(screen.getByRole('button', { name: 'SKT 삭제' }));
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }));
        await waitFor(() => expect(JSON.parse(sessionStorage.getItem('pyeonri.destination')!)).toMatchObject({
            storeId: selectedId, unitPrice: 1200, methods: []
        }));
        await user.click(screen.getByRole('button', { name: '상품 목록' }));
        expect(screen.getByText('목적지')).toBeTruthy();
        expect(screen.getByText(/200원 더 싸요/)).toBeTruthy();
    });
    it('검색·서버 정렬·매장 펼침·재고 표시·목적지 유지가 이어진다', async () => {
        render(<App />); expect(screen.queryByText('빙그레 바나나맛우유 240ml')).toBeNull();
        const user = await searchMilk();
        await user.selectOptions(screen.getByRole('combobox', { name: '정렬' }), 'PRICE');
        await waitFor(() => expect(api.quotes).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'PRICE', wallet: emptyWallet() }), expect.any(AbortSignal)));
        await user.click(await screen.findByRole('button', { name: /빙그레 바나나맛우유/ }));
        // 새 강의장 기준 최적 매장(GS25)만 강조하고 CU와의 차이는 접힌 줄에 표시
        expect(screen.getByText('최저가 · 가장 가까움')).toBeTruthy(); expect(screen.getByText('GS25 신당퍼스트점')).toBeTruthy();
        expect(screen.queryByText('CU 신당다산로점')).toBeNull(); expect(screen.getByText(/200원 더 비싸요/)).toBeTruthy();
        await user.click(screen.getByRole('button', { name: /다른 매장 1곳/ }));
        await user.click(screen.getByRole('button', { name: /CU 신당다산로점/ }));
        await screen.findByText('현재 위치를 확인할 수 없어요'); expect(api.walking).not.toHaveBeenCalled();
        expect(JSON.parse(sessionStorage.getItem('pyeonri.destination')!).storeId).toBe('demo-cu-sindang-dasanro');
        await user.click(screen.getByRole('button', { name: '상품 목록' }));
        // 돌아오면 목적지 상품이 펼쳐져 있고 목적지 매장이 강조 카드에
        expect(screen.getByText('목적지')).toBeTruthy(); expect(screen.getByRole('button', { name: '지도 보기' })).toBeTruthy();
        expect(screen.getByText(/200원 더 싸요/)).toBeTruthy();
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
    it('접힌 카드는 현재 최저가 매장, 펼친 카드는 목적지를 먼저 보여 준다', async () => {
        // GS25를 목적지로 고른 뒤 SKT 등록 → 최저가는 CU 900원으로 바뀜
        localStorage.setItem('pyeonri.wallet', JSON.stringify({ ...emptyWallet(), telecom: { provider: 'SKT', grade: 'VIP' } }));
        sessionStorage.setItem('pyeonri.destination', JSON.stringify({ ...stores[0], productKey: 'binggrae-banana-240', productName: '빙그레 바나나맛우유 240ml', unitPrice: 1000 }));
        render(<App />); const user = await searchMilk();
        const card = screen.getByRole('button', { name: /빙그레 바나나맛우유/ });
        expect(card.querySelector('.where')?.textContent).toContain('신당다산로점');
        expect(card.querySelector('.where')?.textContent).not.toContain('신당퍼스트점');
        await user.click(card);
        expect(screen.getByText('목적지')).toBeTruthy(); expect(screen.getByText('GS25 신당퍼스트점')).toBeTruthy();
    });
    it('통신사가 등록돼 있으면 그 통신사에만 「등록됨」, 다른 통신사는 막고 이유를 보여 준다', async () => {
        localStorage.setItem('pyeonri.wallet', JSON.stringify({ ...emptyWallet(), telecom: { provider: 'SKT', grade: 'VIP' } }));
        const user = userEvent.setup(); render(<App />);
        await user.click(screen.getByRole('button', { name: '할인 수단' }));
        await user.click(await screen.findByRole('button', { name: /할인 수단 추가/ }));
        const skt = await screen.findByRole('button', { name: 'SKT' }); const kt = screen.getByRole('button', { name: 'KT' });
        expect([skt.textContent?.includes('등록됨'), kt.textContent?.includes('등록됨'), kt.hasAttribute('disabled')]).toEqual([true, false, true]);
        expect(screen.getByText(/통신사 멤버십은 하나만 등록돼요/)).toBeTruthy();
    });
    it('저장된 수단과 목적지를 새 마운트에서 복원한다', async () => {
        localStorage.setItem('pyeonri.wallet', JSON.stringify({ ...emptyWallet(), pays: ['KAKAOPAY'] }));
        sessionStorage.setItem('pyeonri.destination', JSON.stringify({ ...cuStore, productKey: 'milk', productName: '우유', unitPrice: 1000 }));
        render(<App />); const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: '할인 수단' })); expect(await screen.findByText('카카오페이')).toBeTruthy();
        await user.click(screen.getByRole('button', { name: '지도' })); expect(screen.getByText('CU 신당다산로점')).toBeTruthy();
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
    const destination = { ...cuStore, productKey: 'milk', productName: '우유', unitPrice: 1000 };
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
        expect(await screen.findByText(/^410m · .* 도착$/)).toBeTruthy(); expect(screen.getByText('도보 7분')).toBeTruthy();
        await waitFor(() => expect(polyline).toHaveBeenCalled());
        expect(polyline.mock.calls.at(-1)![0].path.map((point: Point) => [point.getLng(), point.getLat()])).toEqual(path.map(point => [point.x, point.y]));
        expect(latLng(maps, path[0]).getLat()).toBe(37.5446); unmount(); expect(removed).toHaveBeenCalledWith(null);
    });
    it('경로 실패에도 목적지와 가격을 유지하고 가짜 시간이나 경로를 만들지 않는다', async () => {
        render(<MapView position={{ x: 127, y: 37 }} destination={destination} locationError="" locating={false} locate={vi.fn()} clear={vi.fn()} />);
        expect(await screen.findByText('도보 경로를 찾지 못했어요')).toBeTruthy(); expect(screen.getByText('CU 신당다산로점')).toBeTruthy(); expect(screen.getByText('1,000')).toBeTruthy(); expect(screen.queryByText('걸어서')).toBeNull();
    });
    it('출발 = 도착(path: [])이면 분 · 거리 줄을 숨기고 오류도 띄우지 않는다', async () => {
        vi.mocked(api.walking).mockResolvedValue({ path: [], distanceM: 0, durationSeconds: 0, landingUrl: null });
        render(<MapView position={{ x: 127, y: 37 }} destination={destination} locationError="" locating={false} locate={vi.fn()} clear={vi.fn()} />);
        await waitFor(() => expect(api.walking).toHaveBeenCalled());
        await waitFor(() => expect(screen.queryByRole('status', { name: '도보 경로를 불러오고 있어요' })).toBeNull());
        expect(screen.queryByText('걸어서')).toBeNull(); expect(screen.queryByText('0m')).toBeNull(); expect(screen.getByText(destination.placeName)).toBeTruthy();
    });
    it('위치가 없으면 경로를 요청하지 않고 재시도한다', async () => {
        const retry = vi.fn();
        render(<MapView position={null} destination={destination} locationError="거부됨" locating={false} locate={retry} clear={vi.fn()} />);
        expect(api.walking).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: '다시 시도' })); expect(retry).toHaveBeenCalledOnce();
    });
});

describe('실제 위치 모드 점검(배포 화면)', () => {
    it('위치 확인 전에 검색하면 위치를 기다렸다가 내 위치로 검색한다(기본 좌표로 먼 매장을 고르지 않음)', async () => {
        let found: ((value: { coords: { longitude: number; latitude: number } }) => void) | null = null;
        Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: vi.fn(success => { found = success; }) } });
        const user = userEvent.setup(); render(<App />);
        await user.type(screen.getByRole('textbox', { name: '상품 검색' }), '우유');
        await user.click(screen.getByRole('button', { name: '검색' }));
        expect(api.quotes).not.toHaveBeenCalled();
        found!({ coords: { longitude: 127.0161, latitude: 37.5631 } });
        await waitFor(() => expect(api.quotes).toHaveBeenCalledWith(expect.objectContaining({ x: 127.0161, y: 37.5631 }), expect.anything()));
    });
    it('도보 경로 400은 실제 직선거리가 2km를 넘을 때만 거리 안내(좌표 오류 등 다른 400은 기본 문구)', () => {
        const invalid = new ApiError('INVALID_PARAM', '입력값을 확인해 주세요', 400);
        expect(routeErrorMessage(invalid, 4125)).toBe(tooFarMessage);
        expect(routeErrorMessage(invalid, 120)).toBe('입력값을 확인해 주세요');
        expect(routeErrorMessage(invalid)).toBe('입력값을 확인해 주세요');
    });
    it('다시 검색하면 목적지의 행사 · 할인 수단 · 정가도 새 결과로 저장한다(가격이 같아도)', async () => {
        // 저장된 목적지: GS25 바나나맛우유, 가격은 지금과 같고 할인 수단 · 행사 · 정가는 예전 값
        sessionStorage.setItem('pyeonri.destination', JSON.stringify({ ...stores[0], productKey: 'binggrae-banana-240', productName: '빙그레 바나나맛우유 240ml', unitPrice: 1000, listPrice: 1400, event: 'NONE', methods: [{ type: 'TELECOM', code: 'KT' }] }));
        render(<App />); await searchMilk();
        await waitFor(() => {
            const saved = JSON.parse(sessionStorage.getItem('pyeonri.destination')!);
            expect([saved.unitPrice, saved.event, saved.methods, saved.listPrice]).toEqual([1000, 'TWO_PLUS_ONE', [], 1500]);
        });
    });
    it('할인 수단을 바꾸면 보던 검색 결과를 새 기준으로 다시 받는다(실제 API 모드)', async () => {
        render(<App />); const user = await searchMilk();
        await user.click(screen.getByRole('button', { name: '할인 수단' }));
        await user.click(await screen.findByRole('button', { name: /할인 수단 추가/ }));
        await user.click(await screen.findByRole('button', { name: 'SKT' }));
        await user.click(screen.getByRole('button', { name: '추가' }));
        await waitFor(() => expect(api.quotes).toHaveBeenLastCalledWith(expect.objectContaining({ q: '우유', wallet: expect.objectContaining({ telecom: expect.objectContaining({ provider: 'SKT' }) }) }), expect.anything()));
    });
    it('할인 수단 선택지가 비어 있으면 안내한다', async () => {
        vi.mocked(api.walletOptions).mockResolvedValue({ ...walletOptions, pays: [], memberships: [] });
        const user = userEvent.setup(); render(<App />);
        await user.click(screen.getByRole('button', { name: '할인 수단' }));
        await user.click(await screen.findByRole('button', { name: /할인 수단 추가/ }));
        await user.click(await screen.findByRole('button', { name: /간편결제/ }));
        expect(screen.getByText('지금은 고를 수 있는 항목이 없어요')).toBeTruthy();
    });
});

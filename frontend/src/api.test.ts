import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';
import { emptyWallet, readWallet, saveWallet, readDestination, saveDestination } from './storage';

const memoryStorage = (): Storage => {
    const items = new Map<string, string>();
    return { getItem: key => items.get(key) ?? null, setItem: (key, value) => { items.set(key, value); },
        removeItem: key => { items.delete(key); }, clear: () => items.clear(), key: index => [...items.keys()][index] ?? null,
        get length() { return items.size; } };
};
afterEach(() => vi.unstubAllGlobals());
describe('API 계약', () => {
    it('검색 요청에 저장한 wallet과 좌표를 그대로 전송한다', async () => {
        const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ query: '우유', products: [] })));
        vi.stubGlobal('fetch', fetch);
        const wallet = { ...emptyWallet(), telecom: { provider: 'SKT' as const, grade: 'VIP' as const } };
        await api.quotes({ q: '우유', x: 127, y: 37, sort: 'PRICE', wallet });
        expect(fetch.mock.calls[0][0]).toMatch(/\/api\/quotes$/);
        expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ q: '우유', x: 127, y: 37, sort: 'PRICE', wallet });
    });
    it('실제 경로 요청 좌표 이름을 지키고 응답을 계산하지 않는다', async () => {
        const route = { path: [], distanceM: 0, durationSeconds: 0, landingUrl: null };
        const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(route)));
        vi.stubGlobal('fetch', fetch);
        expect(await api.walking({ x: 127, y: 37 }, { x: 128, y: 38 })).toEqual(route);
        expect(fetch.mock.calls[0][0]).toContain('startX=127&startY=37&endX=128&endY=38');
    });
    it('경로 실패를 직선 경로로 바꾸지 않고 오류로 전달한다', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'ROUTE_NOT_FOUND' }), { status: 404 })));
        await expect(api.walking({ x: 127, y: 37 }, { x: 128, y: 38 })).rejects.toMatchObject({ code: 'ROUTE_NOT_FOUND', status: 404 });
    });
    it('잘못된 검색과 좌표는 요청 전에 차단한다', async () => {
        const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
        await expect(api.quotes({ q: '', x: 127, y: 37 })).rejects.toBeInstanceOf(ApiError);
        await expect(api.walking({ x: NaN, y: 37 }, { x: 127, y: 37 })).rejects.toBeInstanceOf(ApiError);
        expect(fetch).not.toHaveBeenCalled();
    });
});
describe('브라우저 상태 복원', () => {
    it('할인 수단 추가·수정·삭제 후 명세 구조로 복원한다', () => {
        const storage = memoryStorage();
        const wallet = { ...emptyWallet(), pays: ['KAKAOPAY' as const] };
        saveWallet(storage, wallet); expect(readWallet(storage)).toEqual(wallet);
        saveWallet(storage, { ...wallet, pays: ['NAVERPAY'] }); expect(readWallet(storage).pays).toEqual(['NAVERPAY']);
        saveWallet(storage, emptyWallet()); expect(readWallet(storage)).toEqual(emptyWallet());
    });
    it('손상된 저장값은 빈 상태로 복원한다', () => {
        const storage = memoryStorage(); storage.setItem('pyeonri.wallet', '{');
        expect(readWallet(storage)).toEqual(emptyWallet());
        storage.setItem('pyeonri.wallet', JSON.stringify({ ...emptyWallet(), pays: ['INVALID'] }));
        expect(readWallet(storage)).toEqual(emptyWallet());
    });
    it('목적지 하나를 유지하고 해제한다', () => {
        const storage = memoryStorage();
        const destination = { storeId: '1', placeName: 'CU', x: 127, y: 37, productKey: 'milk', productName: '우유', unitPrice: 1000, brand: 'CU' as const };
        saveDestination(storage, destination); expect(readDestination(storage)).toEqual(destination);
        saveDestination(storage, null); expect(readDestination(storage)).toBeNull();
    });
});

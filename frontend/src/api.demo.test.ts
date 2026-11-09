import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoCenter } from './demoLocation';

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
});

async function productionApi(flag: string | undefined) {
    vi.resetModules();
    vi.stubEnv('DEV', false);
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_USE_FIXTURES', flag);
    return import('./api');
}

describe('프로덕션 데모 모드', () => {
    it('true이면 백엔드 없이 선택지·검색·매장 데이터를 제공한다', async () => {
        const fetch = vi.fn().mockRejectedValue(new Error('백엔드 없음'));
        vi.stubGlobal('fetch', fetch);
        const { api, fixturesEnabled } = await productionApi('true');
        expect(fixturesEnabled).toBe(true);
        const options = await api.walletOptions();
        expect(options.telecoms.length).toBeGreaterThan(0);
        const result = await api.quotes({
            q: '우유', ...demoCenter,
            wallet: { telecom: null, cards: [], pays: ['KAKAOPAY'], memberships: [] }
        });
        const product = result.products.find(product => product.productKey === 'binggrae-banana-240');
        expect(product?.storeCount).toBe(product?.stores.length);
        expect(product?.stores[0].applicableMethods).toContainEqual({ type: 'PAY', code: 'KAKAOPAY' });
        expect((await api.stores(demoCenter)).length).toBeGreaterThan(0);
        const discounted = await api.quotes({ q: '우유', ...demoCenter, sort: 'PRICE',
            wallet: { telecom: { provider: 'SKT', grade: 'VIP' }, cards: [], pays: [], memberships: [] } });
        expect(discounted.products[0].minUnitPrice).toBe(900);
        expect(discounted.products[0].stores[0].brand).toBe('CU');
        expect(fetch).not.toHaveBeenCalled();
    });

    it('프로덕션 데모는 강의장·고정 목적지의 예시 경로만 제공한다', async () => {
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);
        const { api } = await productionApi('true');
        const stores = await api.stores(demoCenter);
        for (const store of stores) {
            const route = await api.walking(demoCenter, store);
            expect(route.path[0]).toEqual(demoCenter);
            expect(route.path.at(-1)).toEqual({ x: store.x, y: store.y });
            expect(route.path.length).toBeGreaterThan(3);
            expect(route.distanceM).toBeGreaterThan(0);
            expect(route.durationSeconds).toBeGreaterThan(0);
            expect(route.landingUrl).toBeNull();
        }
        await expect(api.walking({ x: 127, y: 37 }, { x: 128, y: 38 }))
            .rejects.toMatchObject({ code: 'ROUTE_NOT_FOUND', status: 404 });
        expect(fetch).not.toHaveBeenCalled();
    });

    it.each(['false', undefined, 'TRUE', '1'])('%s이면 실제 API를 사용한다', async flag => {
        const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ telecoms: [] })));
        vi.stubGlobal('fetch', fetch);
        const { api, fixturesEnabled } = await productionApi(flag);
        expect(fixturesEnabled).toBe(false);
        expect(await api.walletOptions()).toEqual({ telecoms: [] });
        expect(fetch.mock.calls[0][0]).toMatch(/\/api\/wallet-options$/);
    });

    it.each(['false', undefined])('실제 API 모드(%s)의 오류를 예시 데이터로 대체하지 않는다', async flag => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
            JSON.stringify({ code: 'KAKAO_ERROR', message: '조회 실패' }), { status: 502 }
        )));
        const { api } = await productionApi(flag);
        await expect(api.quotes({ q: '우유', x: 127, y: 37 }))
            .rejects.toMatchObject({ code: 'KAKAO_ERROR', status: 502 });
    });
    it.each(['false', undefined])('실제 API 모드(%s)는 SKT와 데모 좌표에도 서버 가격·경로를 그대로 사용한다', async flag => {
        const { quotes, stores } = await import('./fixtures');
        const response = quotes({ q: '우유', ...demoCenter });
        response.products[0].minUnitPrice = 777;
        response.products[0].stores[0].unitPrice = 777;
        const route = { path: [demoCenter, { x: stores[0].x, y: stores[0].y }], distanceM: 123, durationSeconds: 456, landingUrl: null };
        const fetch = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify(response)))
            .mockResolvedValueOnce(new Response(JSON.stringify(route)));
        vi.stubGlobal('fetch', fetch);
        const { api } = await productionApi(flag);
        const wallet = { telecom: { provider: 'SKT' as const, grade: 'VIP' as const }, cards: [], pays: [], memberships: [] };
        expect(await api.quotes({ q: '우유', ...demoCenter, wallet })).toEqual(response);
        expect(JSON.parse(fetch.mock.calls[0][1].body).wallet).toEqual(wallet);
        expect(await api.walking(demoCenter, stores[0])).toEqual(route);
        expect(fetch.mock.calls[1][0]).toContain('/api/routes/walking?');
        expect(fetch).toHaveBeenCalledTimes(2);
    });
});

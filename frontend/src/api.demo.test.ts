import { afterEach, describe, expect, it, vi } from 'vitest';

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
            q: '우유', x: 127.0563, y: 37.5446,
            wallet: { telecom: null, cards: [], pays: ['KAKAOPAY'], memberships: [] }
        });
        const product = result.products.find(product => product.productKey === 'binggrae-banana-240');
        expect(product?.storeCount).toBe(product?.stores.length);
        expect(product?.stores[0].applicableMethods).toContainEqual({ type: 'PAY', code: 'KAKAOPAY' });
        expect((await api.stores({ x: 127.0563, y: 37.5446 })).length).toBeGreaterThan(0);
        expect(fetch).not.toHaveBeenCalled();
    });

    it('프로덕션 데모에서도 가짜 도보 경로를 만들지 않는다', async () => {
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);
        const { api } = await productionApi('true');
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
});

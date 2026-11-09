import { describe, expect, it } from 'vitest';
import { demoCenter } from './demoLocation';
import { quotes, stores } from './fixtures';
import { searchDefaultCoordinates } from './location';
import { emptyWallet } from './storage';

function distanceFromVenue(x: number, y: number) {
    const radians = (angle: number) => angle * Math.PI / 180;
    const a = Math.sin(radians(y - demoCenter.y) / 2) ** 2
        + Math.cos(radians(demoCenter.y)) * Math.cos(radians(y))
        * Math.sin(radians(x - demoCenter.x) / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

describe('신당동 발표 장소 데모', () => {
    it('가상 SKT 할인으로 최저가·추천 순서가 바뀌고 삭제하면 원복된다', () => {
        const request = { q: '우유', ...demoCenter, sort: 'PRICE' as const };
        const original = quotes({ ...request, wallet: emptyWallet() });
        const discounted = quotes({ ...request, wallet: { ...emptyWallet(), telecom: { provider: 'SKT', grade: 'VIP' } } });
        expect(original.products[0].stores.map(store => [store.brand, store.unitPrice])).toEqual([['GS25', 1000], ['CU', 1200]]);
        expect(discounted.products[0].stores.map(store => [store.brand, store.unitPrice])).toEqual([['CU', 900], ['GS25', 1000]]);
        expect(discounted.products[0].stores[0].applicableMethods).toContainEqual({ type: 'TELECOM', code: 'SKT' });
        for (const response of [original, discounted]) {
            expect(response.products.map(product => product.minUnitPrice)).toEqual([...response.products.map(product => product.minUnitPrice)].sort((a, b) => a - b));
            for (const product of response.products) expect(product.minUnitPrice).toBe(Math.min(...product.stores.map(store => store.unitPrice)));
        }
        expect(quotes({ ...request, wallet: emptyWallet() })).toEqual(original);
        expect(quotes({ ...request, wallet: { ...emptyWallet(), telecom: { provider: 'KT', grade: 'VIP' } } })).toEqual(original);
    });
    it('확인한 동산빌딩 좌표를 사용하고 실제 API 기본 좌표를 유지한다', () => {
        expect(demoCenter).toEqual({ x: 127.0161468688, y: 37.562768271563 });
        expect(searchDefaultCoordinates).toEqual({ x: 127.0563, y: 37.5446 });
    });
    it('3개 편의점이 500m 이내이며 직선거리·추정 분이 일치한다', () => {
        expect(stores).toHaveLength(3);
        expect(new Set(stores.map(store => store.storeId)).size).toBe(3);
        for (const store of stores) {
            const distance = distanceFromVenue(store.x, store.y);
            expect(distance).toBeLessThan(500);
            expect(store.distanceM).toBe(Math.round(distance));
            expect(store.walkMin).toBe(Math.ceil(store.distanceM / 67));
            expect(store.placeName).not.toMatch(/성수|예시점/);
        }
        expect(stores.map(store => store.distanceM)).toEqual([21, 114, 205]);
    });
    it('상품·행사·가격·키워드를 유지하고 모든 상품 매장을 검증된 목록에서 사용한다', () => {
        for (const q of ['우유', '바나나', '커피', '라떼']) {
            const result = quotes({ q, ...demoCenter, sort: 'PRICE' });
            expect(result.products.map(product => [product.productKey, product.event, product.minUnitPrice]))
                .toEqual([
                    ['binggrae-banana-240', 'TWO_PLUS_ONE', 1000],
                    ['maeil-barista-latte-325', 'ONE_PLUS_ONE', 1250]
                ]);
            for (const product of result.products) {
                expect(product.storeCount).toBe(product.stores.length);
                for (const store of product.stores) {
                    const known = stores.find(place => place.storeId === store.storeId);
                    expect(known).toBeDefined();
                    expect(store).toMatchObject(known!);
                }
            }
        }
        expect(quotes({ q: '검색결과없음', ...demoCenter }).products).toEqual([]);
    });
});

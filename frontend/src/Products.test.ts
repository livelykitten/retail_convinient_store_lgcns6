import { describe, expect, it } from 'vitest';
import { diffText, featuredLabel } from './Products';
import type { Product, QuoteStore } from './types';

const store = (over: Partial<QuoteStore>): QuoteStore => ({
    storeId: 's', brand: 'CU', placeName: 'CU', x: 127, y: 37, distanceM: 240, walkMin: 4,
    event: 'NONE', eventLabel: '', unitPrice: 1000, applicableMethods: [], stockStatus: 'IN_STOCK', ...over
});
const product = (stores: QuoteStore[]): Product => ({
    productKey: 'p', name: 'p', imageUrl: null, event: 'NONE', listPrice: 1000, minUnitPrice: 1000, storeCount: stores.length, stores
});

describe('강조 카드 라벨', () => {
    const cu = store({ storeId: 'cu', distanceM: 240 }); const gs = store({ storeId: 'gs', distanceM: 380 });
    it('목적지가 가장 먼저', () => expect(featuredLabel(product([cu, gs]), gs, true)).toBe('목적지'));
    it('매장 1곳이면 라벨 없음', () => expect(featuredLabel(product([cu]), cu, false)).toBeNull());
    it('전부 OUT이면 라벨 없음', () => expect(featuredLabel(product([store({ stockStatus: 'OUT' }), store({ stockStatus: 'OUT' })]), cu, false)).toBeNull());
    it('가장 싸고 가장 가까우면', () => expect(featuredLabel(product([cu, gs]), cu, false)).toBe('최저가 · 가장 가까움'));
    it('가장 싸지만 더 멀면', () => expect(featuredLabel(product([gs, store({ storeId: 'x', distanceM: 100, unitPrice: 1200 })]), gs, false)).toBe('최저가'));
    it('OUT 매장은 가까움 비교에서 뺀다', () => expect(featuredLabel(product([cu, store({ distanceM: 50, stockStatus: 'OUT' })]), cu, false)).toBe('최저가 · 가장 가까움'));
});

describe('차이 문구', () => {
    const base = store({ walkMin: 4, unitPrice: 1000 });
    it.each([
        [store({ stockStatus: 'OUT' }), '재고 없음 · 예시 데이터'],
        [store({ walkMin: 6 }), '같은 가격인데 약 2분 더 걸려요'],
        [store({ walkMin: 2 }), '같은 가격이고 약 2분 가까워요'],
        [store({ walkMin: 4 }), '같은 가격, 비슷한 거리예요'],
        [store({ unitPrice: 1200, walkMin: 2 }), '200원 더 비싸지만 약 2분 가까워요'],
        [store({ unitPrice: 1200, walkMin: 5 }), '200원 더 비싸요'],
        [store({ unitPrice: 900, walkMin: 7 }), '100원 더 싸지만 약 3분 더 걸려요'],
        [store({ unitPrice: 900, walkMin: 4 }), '100원 더 싸요']
    ])('%#', (other, text) => expect(diffText(base, other)).toBe(text));
});

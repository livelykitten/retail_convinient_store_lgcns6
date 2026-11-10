// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ArrivalView } from './Arrival';
import { Home, Products } from './Products';
import { bundle, makePlan, plannedOf } from './ledgerData';
import { addRecent, emptyWallet, readDestination, readRecent, saveDestination } from './storage';
import type { Product, QuoteStore, Event } from './types';

const store: QuoteStore = {
    storeId: 's', brand: 'CU', placeName: 'CU 예시점', x: 127, y: 37, distanceM: 100, walkMin: 2,
    event: 'OTHER', eventLabel: null, unitPrice: 1700, applicableMethods: [{ type: 'CARD', code: 'demo-card' }], stockStatus: 'IN_STOCK'
};
const product: Product = {
    productKey: 'p', name: '예시 콜라', imageUrl: null, event: 'OTHER', listPrice: 2000,
    minUnitPrice: 1700, storeCount: 1, stores: [store]
};
const plan = () => makePlan({ productKey: 'p', productName: product.name, brand: 'CU', storeId: 's', placeName: store.placeName,
    event: 'OTHER', listPrice: 2000, unitPrice: 1700, methods: store.applicableMethods }, emptyWallet());
afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); });

describe('OTHER 행사 응답', () => {
    it('상품·매장 가격은 유지하고 행사 배지와 묶음 구매 안내를 표시하지 않는다', () => {
        const { container } = render(<Products result={{ query: '콜라', products: [product] }} busy={false} error="" sort="PRICE"
            changeSort={vi.fn()} destination={null} wallet={emptyWallet()} choose={vi.fn()} retry={vi.fn()} expanded="p" toggle={vi.fn()} />);
        expect(screen.getByText(product.name)).toBeTruthy();
        expect(container.textContent).toContain('1,700');
        expect(container.querySelector('.event')).toBeNull();
        expect(container.querySelector('.bundle-pay')).toBeNull();
        expect(container.textContent).not.toMatch(/NaN|undefined|기타 행사/);
    });

    it('최근 검색과 목적지의 OTHER를 저장하고 복원한다', () => {
        addRecent(localStorage, [], { ...product, unitPrice: 1700, brand: 'CU', query: '콜라' });
        const recent = readRecent(localStorage);
        expect(recent).toHaveLength(1);
        expect(recent[0].event).toBe('OTHER');
        saveDestination(sessionStorage, { ...store, productKey: 'p', productName: product.name, event: 'OTHER' });
        expect(readDestination(sessionStorage)?.event).toBe('OTHER');
        const { container } = render(<Home wallet={emptyWallet()} recent={recent} nearby={[]} search={vi.fn()} openRecent={vi.fn()} goWallet={vi.fn()} goMap={vi.fn()} />);
        expect(container.querySelector('.recent-card em')).toBeNull();
    });

    it('도착 화면·가계부는 한 개 기준이며 카드 할인액을 행사 할인으로 계산하지 않는다', () => {
        const value = plan();
        expect(bundle('OTHER')).toEqual([1, 1]);
        expect([value.qty, value.pay, value.saved]).toEqual([1, 1700, 300]);
        expect(plannedOf(value).lines.find(line => line.kind === 'EVENT')?.amount).toBe(0);
        expect(plannedOf(value).lines.find(line => line.kind === 'CARD')?.amount).toBe(300);
        const { container } = render(<ArrivalView plan={value} saved={0} bought={vi.fn()} skip={vi.fn()} />);
        expect(screen.getByText('예상 결제')).toBeTruthy();
        expect(container.textContent).toContain('1,700');
        expect(container.textContent).not.toMatch(/개를 챙기세요|NaN|undefined|기타 행사/);
    });

    it.each<[Event, number, number]>([
        ['NONE', 1, 1], ['OTHER', 1, 1], ['ONE_PLUS_ONE', 2, 1], ['TWO_PLUS_ONE', 3, 2], ['THREE_PLUS_ONE', 4, 3]
    ])('%s 묶음 계산 유지', (event, count, paid) => {
        expect(bundle(event)).toEqual([count, paid]);
    });
});

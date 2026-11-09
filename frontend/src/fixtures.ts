import type { QuoteRequest, QuoteResponse, QuoteStore, Store, WalletOptions } from './types';

export const walletOptions: WalletOptions = {
    telecoms: [
        { code: 'SKT', name: 'SKT', grades: ['VIP', 'NORMAL', 'UNKNOWN'] },
        { code: 'KT', name: 'KT', grades: ['VIP', 'NORMAL', 'UNKNOWN'] },
        { code: 'LGU', name: 'LG U+', grades: ['VIP', 'NORMAL', 'UNKNOWN'] }
    ],
    cards: [
        { cardId: 'shinhan-deepdream-check', name: '신한카드 Deep Dream 체크', issuer: 'SHINHAN' },
        { cardId: 'shinhan-mrlife', name: '신한카드 Mr.Life', issuer: 'SHINHAN' }
    ],
    cardIssuers: [{ code: 'SHINHAN', name: '신한' }, { code: 'KB', name: 'KB국민' }, { code: 'WOORI', name: '우리' }],
    pays: [{ code: 'KAKAOPAY', name: '카카오페이' }, { code: 'NAVERPAY', name: '네이버페이' }, { code: 'TOSSPAY', name: '토스페이' }, { code: 'SAMSUNGWALLET', name: '삼성월렛' }],
    memberships: [{ brand: 'CU', name: 'CU 멤버십' }, { brand: 'GS25', name: 'GS&POINT' }, { brand: 'SEVEN', name: '세븐일레븐 멤버십' }, { brand: 'EMART24', name: '이마트24 멤버십' }]
};
export const stores: Store[] = [
    { storeId: '12345678', brand: 'CU', placeName: 'CU 성수연무장점', x: 127.0571, y: 37.5431, distanceM: 240, walkMin: 4 },
    { storeId: '87654321', brand: 'GS25', placeName: 'GS25 성수역점', x: 127.0559, y: 37.5448, distanceM: 380, walkMin: 6 }
];
export function quotes(input: QuoteRequest): QuoteResponse {
    const rows: QuoteStore[] = stores.map((store, index) => ({ ...store,
        event: 'TWO_PLUS_ONE', eventLabel: '2+1 행사', unitPrice: 1000,
        applicableMethods: [
            ...(input.wallet?.telecom && index === 0 ? [{ type: 'TELECOM' as const, code: input.wallet.telecom.provider }] : []),
            ...(input.wallet?.cards ?? []).filter(card => card.cardId).map(card => ({ type: 'CARD' as const, code: card.cardId! })),
            ...(input.wallet?.pays ?? []).map(code => ({ type: 'PAY' as const, code })),
            ...(input.wallet?.memberships ?? []).filter(code => code === store.brand).map(code => ({ type: 'MEMBERSHIP' as const, code }))
        ], stockStatus: index === 0 ? 'IN_STOCK' : 'LOW'
    }));
    const products: QuoteResponse['products'] = [{
        productKey: 'binggrae-banana-240', name: '빙그레 바나나맛우유 240ml', imageUrl: null,
        event: 'TWO_PLUS_ONE', listPrice: 1500, minUnitPrice: 1000, storeCount: rows.length, stores: rows
    }, {
        productKey: 'maeil-barista-latte-325', name: '매일 바리스타룰스 카페라떼 325ml', imageUrl: null,
        event: 'ONE_PLUS_ONE', listPrice: 2500, minUnitPrice: 1250, storeCount: 1,
        stores: [{ storeId: 'example-cafe-01', brand: 'SEVEN', placeName: '세븐일레븐 예시점', x: 127.0580, y: 37.5450,
            distanceM: 210, walkMin: 4, event: 'ONE_PLUS_ONE', eventLabel: '1+1 행사', unitPrice: 1250, applicableMethods: [], stockStatus: 'IN_STOCK' }]
    }];
    products.sort(input.sort === 'PRICE' ? (a, b) => a.minUnitPrice - b.minUnitPrice : (a, b) => Math.min(...a.stores.map(store => store.distanceM)) - Math.min(...b.stores.map(store => store.distanceM)));
    return { query: input.q, products: /우유|바나나|커피|라떼/.test(input.q) ? products : [] };
}

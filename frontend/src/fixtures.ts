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
    // 주소와 좌표의 출처는 README의 발표 장소 데모 데이터 표 참고.
    // distanceM = 강의장 대표 좌표에서의 직선거리(m, 반올림), walkMin = ceil(distanceM / 67).
    // 실제 출입구 측량·보행 경로·영업 상태·가격·재고를 보증하는 데이터가 아니다.
    { storeId: 'demo-gs25-sindang-first', brand: 'GS25', placeName: 'GS25 신당퍼스트점',
        x: 127.0160011385, y: 37.562617536025, distanceM: 21, walkMin: 1 },
    { storeId: 'demo-cu-sindang-dasanro', brand: 'CU', placeName: 'CU 신당다산로점',
        x: 127.0161509, y: 37.5617411, distanceM: 114, walkMin: 2 },
    { storeId: 'demo-seven-sindang', brand: 'SEVEN', placeName: '세븐일레븐 신당점',
        x: 127.017856, y: 37.561518, distanceM: 205, walkMin: 4 }
];
export function quotes(input: QuoteRequest): QuoteResponse {
    // PPT 전용 가상 시나리오: CU 1,200원 → SKT(모든 등급) 등록 시 25% 할인, 900원.
    // 실제 제휴·행사·할인 계산 규칙이 아니다. 실제 API에서는 이 모듈을 사용하지 않는다.
    const skt = input.wallet?.telecom?.provider === 'SKT';
    const bananaStores = stores.slice(0, 2);
    const rows: QuoteStore[] = bananaStores.map(store => ({ ...store,
        event: 'TWO_PLUS_ONE', eventLabel: '2+1 행사', unitPrice: store.brand === 'CU' ? (skt ? 900 : 1200) : 1000,
        applicableMethods: [
            ...(skt && store.brand === 'CU' ? [{ type: 'TELECOM' as const, code: 'SKT' }] : []),
            ...(input.wallet?.cards ?? []).filter(card => card.cardId).map(card => ({ type: 'CARD' as const, code: card.cardId! })),
            ...(input.wallet?.pays ?? []).map(code => ({ type: 'PAY' as const, code })),
            ...(input.wallet?.memberships ?? []).filter(code => code === store.brand).map(code => ({ type: 'MEMBERSHIP' as const, code }))
        ], stockStatus: store.brand === 'CU' ? 'IN_STOCK' : 'LOW'
    }));
    // 상품 내 추천은 개당 가격 → 거리순. 화면은 이 응답 순서를 그대로 사용한다.
    rows.sort((a, b) => a.unitPrice - b.unitPrice || a.distanceM - b.distanceM);
    const products: QuoteResponse['products'] = [{
        productKey: 'binggrae-banana-240', name: '빙그레 바나나맛우유 240ml', imageUrl: null,
        event: 'TWO_PLUS_ONE', listPrice: 1500, minUnitPrice: rows[0].unitPrice, storeCount: rows.length, stores: rows
    }, {
        productKey: 'maeil-barista-latte-325', name: '매일 바리스타룰스 카페라떼 325ml', imageUrl: null,
        event: 'ONE_PLUS_ONE', listPrice: 2500, minUnitPrice: 1250, storeCount: 1,
        stores: [{ ...stores[2], event: 'ONE_PLUS_ONE', eventLabel: '1+1 행사', unitPrice: 1250,
            applicableMethods: [], stockStatus: 'IN_STOCK' }]
    }];
    products.sort(input.sort === 'PRICE' ? (a, b) => a.minUnitPrice - b.minUnitPrice : (a, b) => Math.min(...a.stores.map(store => store.distanceM)) - Math.min(...b.stores.map(store => store.distanceM)));
    return { query: input.q, products: /우유|바나나|커피|라떼/.test(input.q) ? products : [] };
}

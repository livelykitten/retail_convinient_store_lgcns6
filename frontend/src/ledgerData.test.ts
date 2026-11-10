import { describe, expect, it } from 'vitest';
import { byParticle, demoLedger, makePlan, makeReceiptEntry, monthSummary, objectParticle, reverse, totalSaved } from './ledgerData';
import { emptyWallet } from './storage';

const kt = { code: 'KT', label: 'KT 멤버십' };
const card = { code: 'shinhan-mrlife', label: '신한카드 Mr.Life' };
const amounts = (lines: { label: string; amount: number }[]) => Object.fromEntries(lines.map(line => [line.label, line.amount]));

describe('가계부에 적기 · 거꾸로 계산 (피그마 추가 화면 v3)', () => {
    it('3번: 목적지 상품만 · 낸 돈 1,710원 → KT 200 · 카드 190 = 390원', () => {
        const result = reverse({ paid: 1710, items: [], telecom: kt, card });
        expect(amounts(result.lines)).toEqual({ 행사: 0, 'KT 멤버십': 200, '신한카드 Mr.Life': 190 });
        expect(result.saved).toBe(390);
    });
    it('4번: 여러 개 · 5,220원 + 코카콜라 1+1 2,200원 → 행사 2,200 · KT 300 · 카드 580 = 3,080원', () => {
        const result = reverse({ paid: 5220, items: [{ name: '코카콜라캔350ml', event: 'ONE_PLUS_ONE', price: 2200 }], telecom: kt, card });
        expect(amounts(result.lines)).toEqual({ 행사: 2200, 'KT 멤버십': 300, '신한카드 Mr.Life': 580 });
        expect(result.saved).toBe(3080);
    });
    it('통신사 할인은 1,000원 단위라 맞지 않으면 덜 아낀 쪽으로 잡는다', () => {
        // 2,750원 → 행사 아닌 금액 2,950원, 통신사 200원
        expect(reverse({ paid: 2750, items: [], telecom: kt, card: null }).saved).toBe(200);
    });
    it('할인 수단을 안 썼으면 행사만', () => {
        const result = reverse({ paid: 3000, items: [{ name: '빙그레 바나나맛우유', event: 'TWO_PLUS_ONE', price: 1500 }], telecom: null, card: null });
        expect(result.lines).toEqual([{ kind: 'EVENT', code: 'EVENT', label: '행사', amount: 1500 }]);
    });
    it('행사 상품 하나만 샀으면 받은 개수를 같이 적고, 다른 것도 샀으면 1개로 적는다', () => {
        const store = { brand: 'SEVEN' as const, storeId: 'seven-1', placeName: '세븐일레븐 신당본점' };
        const only = makeReceiptEntry({ paid: 1890, items: [{ name: '펩시제로라임캔355ml', event: 'ONE_PLUS_ONE', price: 2100 }], telecom: null, card }, store, { productKey: 'x', productName: 'x' });
        expect([only.productName, only.qty, only.saved]).toEqual(['펩시제로라임캔355ml', 2, 2310]);
        const mixed = makeReceiptEntry({ paid: 5220, items: [{ name: '코카콜라캔350ml', event: 'ONE_PLUS_ONE', price: 2200 }], telecom: kt, card }, store, { productKey: 'x', productName: 'x' });
        expect([mixed.qty, mixed.saved, mixed.lines.map(line => line.label)]).toEqual([1, 3080, ['행사 (1+1 · 2+1)', 'KT 멤버십', '신한카드 Mr.Life']]);
    });
});

describe('도착 화면 계산값', () => {
    it('2번: GS25 펩시제로라임 · KT + 신한카드 → 예상 1,710원, KT -200 · 카드 -190', () => {
        const wallet = { ...emptyWallet(), telecom: { provider: 'KT' as const, grade: 'VIP' as const }, cards: [{ cardId: 'shinhan-mrlife', issuer: 'SHINHAN' as const }] };
        const plan = makePlan({ productKey: 'p', productName: '펩시제로라임캔355ml', brand: 'GS25', storeId: 's', placeName: 'GS25 신당퍼스트점', event: 'NONE', listPrice: 2100, unitPrice: 1710,
            methods: [{ type: 'TELECOM', code: 'KT' }, { type: 'CARD', code: 'shinhan-mrlife' }] }, wallet, { 'shinhan-mrlife': '신한카드 Mr.Life' });
        expect([plan.qty, plan.pay, plan.saved]).toEqual([1, 1710, 390]);
        expect(plan.methods.map(method => [method.label, method.amount])).toEqual([['KT 멤버십', 200], ['신한카드 Mr.Life', 190]]);
    });
    it('1+1이면 2개 묶음으로 계산한다', () => {
        const plan = makePlan({ productKey: 'p', productName: '펩시', brand: 'SEVEN', storeId: 's', placeName: '세븐', event: 'ONE_PLUS_ONE', listPrice: 2100, unitPrice: 945, methods: [] }, emptyWallet());
        expect([plan.qty, plan.pay, plan.saved]).toEqual([2, 1890, 2310]);
    });
});

describe('가계부 요약', () => {
    it('5번 예시 기록: 11월 8,000원 · 구매 4번 · 결제 12,600원 · 행사 6,400 · 카드 1,000 · KT 600', () => {
        const summary = monthSummary(demoLedger, new Date('2026-11-10T12:00:00+09:00'));
        expect([summary.month, summary.saved, summary.count, summary.paid]).toEqual([11, 8000, 4, 12600]);
        expect(summary.lines.map(line => [line.label, line.amount])).toEqual([['행사 (1+1 · 2+1)', 6400], ['신한카드 Mr.Life', 1000], ['KT 멤버십', 600]]);
        expect(totalSaved(demoLedger)).toBe(8000);
    });
    it('조사', () => {
        expect(objectParticle('펩시제로라임캔355ml')).toBe('을'); expect(objectParticle('착한제육비빔밥')).toBe('을'); expect(objectParticle('바나나우유')).toBe('를');
        expect(byParticle('신한카드 Mr.Life')).toBe('로'); expect(byParticle('카카오페이')).toBe('로'); expect(byParticle('신한카드')).toBe('로'); expect(byParticle('현대카드 M')).toBe('로');
    });
});

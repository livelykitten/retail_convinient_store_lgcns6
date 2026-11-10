// 추가 화면 v3 「도착 → 가계부 · 재고 표시」(피그마 327:230). 프론트 전용 · 이 기기(localStorage)에만 저장한다.
// 가계부 = 영수증 합계 + 1+1 · 2+1로 산 상품. 장바구니 없이 낸 돈으로 통신사 · 카드 할인을 거꾸로 계산한다(정한 것 11-10).
// 아낀 돈 기준은 정가 대비(아직 정할 것의 현재안).
import type { Brand, Event, MethodType, Wallet } from './types';
import { labels } from './ui';

export type SaveKind = 'EVENT' | MethodType | 'OTHER';
export interface SaveLine { kind: SaveKind; code: string; label: string; amount: number }
export interface LedgerEntry {
    id: string; at: string; productKey: string; productName: string; brand: Brand; storeId: string; placeName: string;
    qty: number; paid: number; listPrice: number; saved: number; lines: SaveLine[];
}
/** 도착 화면에 쓰는 앱 계산값(목적지 상품 1개 묶음 기준) */
export interface Plan {
    productKey: string; productName: string; brand: Brand; storeId: string; placeName: string;
    event: Event; listPrice: number; unitPrice: number; qty: number; pay: number; saved: number;
    methods: (SaveLine & { kind: MethodType })[];
}

const KEY = 'pyeonri.ledger';
const brands = ['CU', 'GS25', 'SEVEN', 'EMART24'];
const kinds = ['EVENT', 'TELECOM', 'CARD', 'PAY', 'MEMBERSHIP', 'OTHER'];
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const int = (value: unknown) => Number.isInteger(value) && (value as number) >= 0;

function isEntry(value: unknown): value is LedgerEntry {
    return record(value) && ['id', 'at', 'productKey', 'productName', 'storeId', 'placeName'].every(key => typeof value[key] === 'string')
        && brands.includes(String(value.brand)) && !Number.isNaN(Date.parse(String(value.at)))
        && int(value.qty) && (value.qty as number) > 0 && int(value.paid) && int(value.listPrice) && int(value.saved)
        && Array.isArray(value.lines) && value.lines.every(line => record(line) && kinds.includes(String(line.kind))
            && typeof line.code === 'string' && typeof line.label === 'string' && int(line.amount));
}
/** 저장된 적이 없으면 null (데모 예시 기록을 넣을지 판단용) */
export function readLedger(storage: Storage): LedgerEntry[] | null {
    try {
        const raw = storage.getItem(KEY);
        if (raw === null) return null;
        const value: unknown = JSON.parse(raw);
        return Array.isArray(value) ? value.filter(isEntry) : [];
    } catch { return []; }
}
export function saveLedger(storage: Storage, list: LedgerEntry[]) { storage.setItem(KEY, JSON.stringify(list)); }

// ---------------------------------------------------------------------
// 할인 규칙(예시). 실제 규칙표가 아니라 피그마 v3 숫자에 맞춘 프론트 목업 값이다.
//  - 통신사 멤버십: 행사 상품이 아닌 금액 1,000원당 100원 (1+1 · 2+1에는 중복 안 됨)
//  - 카드: 결제 금액의 10%
// ---------------------------------------------------------------------
export const TELECOM_STEP = 1000;
export const TELECOM_OFF = 100;
export const CARD_RATE = 0.1;

/** N+1 묶음: 받는 개수 · 값 내는 개수 */
export const bundle = (event: Event) => ({ NONE: [1, 1], ONE_PLUS_ONE: [2, 1], TWO_PLUS_ONE: [3, 2], THREE_PLUS_ONE: [4, 3] }[event] as [number, number]);

export function methodLabel(type: MethodType, code: string, wallet: Wallet, cardNames: Record<string, string> = {}) {
    if (type === 'TELECOM' || type === 'MEMBERSHIP') return `${labels[code] ?? code} 멤버십`;
    if (type === 'PAY') return labels[code] ?? code;
    const card = wallet.cards.find(value => value.cardId === code);
    return cardNames[code] ?? card?.name ?? (card ? `${labels[card.issuer]}카드` : '카드');
}
/** amount를 weights 비율로 나눈다(원 단위, 남는 원은 앞에서부터) */
export function split(amount: number, weights: number[]) {
    if (!weights.length) return [];
    const total = weights.reduce((sum, value) => sum + value, 0);
    const base = weights.map(value => total > 0 ? Math.floor(amount * value / total) : Math.floor(amount / weights.length));
    let rest = amount - base.reduce((sum, value) => sum + value, 0);
    for (let index = 0; rest > 0; index = (index + 1) % base.length, rest--) base[index]++;
    return base;
}

/** 목적지 매장 · 상품으로 도착 화면 값을 만든다. 결제액은 API 개당 가격 × 묶음 개수, 수단별 금액은 위 예시 규칙 비율로 나눈다 */
export function makePlan(input: {
    productKey: string; productName: string; brand: Brand; storeId: string; placeName: string;
    event: Event; listPrice: number; unitPrice: number; methods: { type: MethodType; code: string }[];
}, wallet: Wallet, cardNames: Record<string, string> = {}): Plan {
    const [qty, paidQty] = bundle(input.event);
    const pay = input.unitPrice * qty;
    const saved = Math.max(0, input.listPrice * qty - pay);
    const gross = input.listPrice * paidQty;
    const telecom = input.event === 'NONE' ? Math.floor(gross / TELECOM_STEP) * TELECOM_OFF : 0;
    const weights = input.methods.map(method => method.type === 'TELECOM' ? telecom : method.type === 'CARD' ? Math.round((gross - telecom) * CARD_RATE) : 0);
    const methodSave = Math.max(0, gross - pay);
    const amounts = split(methodSave, weights.some(value => value > 0) ? weights : input.methods.map(() => 1));
    const methods = input.methods.map((method, index) => ({ kind: method.type, code: method.code, label: methodLabel(method.type, method.code, wallet, cardNames), amount: amounts[index] }));
    return { ...input, qty, pay, saved, methods };
}

// ---------------------------------------------------------------------
// 「가계부에 적기」: 낸 돈 합계 + 행사 상품으로 거꾸로 계산
// ---------------------------------------------------------------------
export interface EventItem { name: string; event: Exclude<Event, 'NONE'>; price: number }
export interface Receipt {
    paid: number; items: EventItem[];
    telecom: { code: string; label: string } | null;
    card: { code: string; label: string } | null;
}
export function reverse(receipt: Receipt) {
    const eventPaid = receipt.items.reduce((sum, item) => sum + item.price * bundle(item.event)[1], 0);
    const eventSave = receipt.items.reduce((sum, item) => { const [get, pay] = bundle(item.event); return sum + item.price * (get - pay); }, 0);
    // 카드 전 금액. 원 단위가 안 맞으면 내림(덜 아낀 쪽)
    const beforeCard = receipt.card ? Math.floor(receipt.paid / (1 - CARD_RATE) + 1e-9) : receipt.paid;
    const card = beforeCard - receipt.paid;
    // 통신사: 행사 아닌 금액 Y에서 floor(Y / 1000) × 100을 뺀 값 = target. 맞는 k 중 가장 작은 값(덜 아낀 쪽)
    const target = beforeCard - eventPaid;
    let telecom = 0;
    if (receipt.telecom && target > 0) {
        let k = 0;
        while (Math.floor((target + TELECOM_OFF * k) / TELECOM_STEP) > k) k++;
        telecom = TELECOM_OFF * k;
    }
    const lines: SaveLine[] = [{ kind: 'EVENT', code: 'EVENT', label: '행사', amount: eventSave }];
    if (receipt.telecom) lines.push({ kind: 'TELECOM', code: receipt.telecom.code, label: receipt.telecom.label, amount: telecom });
    if (receipt.card) lines.push({ kind: 'CARD', code: receipt.card.code, label: receipt.card.label, amount: card });
    return { lines, saved: eventSave + telecom + card, gross: beforeCard + telecom + eventSave, eventOnly: receipt.items.length === 1 && target <= 0 };
}
export function makeReceiptEntry(receipt: Receipt, store: { brand: Brand; storeId: string; placeName: string }, fallback: { productKey: string; productName: string }, at = new Date()): LedgerEntry {
    const { lines, saved, gross, eventOnly } = reverse(receipt);
    const first = receipt.items[0];
    return {
        id: `${at.getTime()}-${Math.random().toString(36).slice(2, 8)}`, at: at.toISOString(),
        productKey: first ? `receipt-${first.name}` : fallback.productKey, productName: first?.name ?? fallback.productName,
        brand: store.brand, storeId: store.storeId, placeName: store.placeName,
        // 행사 상품 하나만 샀으면 받은 개수(「2개」)를 같이 적는다
        qty: eventOnly ? bundle(first.event)[0] : 1,
        paid: receipt.paid, listPrice: gross, saved,
        lines: lines.filter(line => line.amount > 0).map(line => line.kind === 'EVENT' ? { ...line, label: '행사 (1+1 · 2+1)' } : line)
    };
}

// ---------------------------------------------------------------------
// 가계부 화면 요약
// ---------------------------------------------------------------------
export const totalSaved = (list: LedgerEntry[]) => list.reduce((sum, entry) => sum + entry.saved, 0);
export function monthSummary(list: LedgerEntry[], now = new Date()) {
    const month = list.filter(entry => { const at = new Date(entry.at); return at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth(); });
    const byLine = new Map<string, SaveLine>();
    for (const line of month.flatMap(entry => entry.lines)) {
        const key = line.kind === 'EVENT' ? 'EVENT' : `${line.kind}:${line.code}`;
        const current = byLine.get(key);
        byLine.set(key, current ? { ...current, amount: current.amount + line.amount } : { ...line });
    }
    return {
        month: now.getMonth() + 1, count: month.length, saved: totalSaved(month), paid: month.reduce((sum, entry) => sum + entry.paid, 0),
        lines: [...byLine.values()].sort((a, b) => b.amount - a.amount)
    };
}
const days = ['일', '월', '화', '수', '목', '금', '토'];
export const dayLabel = (at: Date) => `${at.getMonth() + 1}월 ${at.getDate()}일 (${days[at.getDay()]})`;
export const timeLabel = (at: Date) => at.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
/** 날짜별 묶음, 최근 순 */
export function groupByDay(list: LedgerEntry[]) {
    const sorted = [...list].sort((a, b) => b.at.localeCompare(a.at));
    const groups: { day: string; entries: LedgerEntry[] }[] = [];
    for (const entry of sorted) {
        const day = dayLabel(new Date(entry.at));
        if (groups.at(-1)?.day === day) groups.at(-1)!.entries.push(entry); else groups.push({ day, entries: [entry] });
    }
    return groups;
}

/** 받침에 맞는 목적격 조사. 한글이 아니면(용량 ml 등) 「을」 */
export function objectParticle(word: string) {
    const last = word.trim().at(-1) ?? '';
    const code = last.charCodeAt(0) - 0xAC00;
    if (code < 0 || code > 11171) return '을';
    return code % 28 ? '을' : '를';
}
/** 「~로/~으로」. 받침 없음 · ㄹ 받침 · 한글 아님(Mr.Life 등)은 「로」 */
export function byParticle(word: string) {
    const last = word.trim().at(-1) ?? '';
    const code = last.charCodeAt(0) - 0xAC00;
    if (code < 0 || code > 11171) return '로';
    const final = code % 28;
    return final === 0 || final === 8 ? '로' : '으로';
}

/** 발표용 예시 기록(데모 모드에서 저장된 적이 없을 때만). 피그마 v3 5번 화면 값 */
const shinhan = { kind: 'CARD' as const, code: 'shinhan-mrlife', label: '신한카드 Mr.Life' };
const kt = { kind: 'TELECOM' as const, code: 'KT', label: 'KT 멤버십' };
const event = { kind: 'EVENT' as const, code: 'EVENT', label: '행사 (1+1 · 2+1)' };
export const demoLedger: LedgerEntry[] = [
    { id: 'demo-1', at: '2026-11-10T06:42:00.000Z', productKey: 'receipt-코카콜라캔350ml', productName: '코카콜라캔350ml', brand: 'GS25', storeId: 'demo-gs25-sindang-first', placeName: 'GS25 신당퍼스트점', qty: 1, paid: 5220, listPrice: 8300, saved: 3080,
        lines: [{ ...event, amount: 2200 }, { ...kt, amount: 300 }, { ...shinhan, amount: 580 }] },
    { id: 'demo-2', at: '2026-11-10T03:21:00.000Z', productKey: 'good-jeyuk-bibimbap', productName: '착한제육비빔밥', brand: 'GS25', storeId: 'demo-gs25-sindang-first', placeName: 'GS25 신당퍼스트점', qty: 1, paid: 3600, listPrice: 3900, saved: 300,
        lines: [{ ...kt, amount: 300 }] },
    { id: 'demo-3', at: '2026-11-09T06:10:00.000Z', productKey: 'pepsi-zero-lime-355', productName: '펩시제로라임캔355ml', brand: 'SEVEN', storeId: 'demo-seven-sindang', placeName: '세븐일레븐 신당본점', qty: 2, paid: 1890, listPrice: 4200, saved: 2310,
        lines: [{ ...event, amount: 2100 }, { ...shinhan, amount: 210 }] },
    { id: 'demo-4', at: '2026-11-06T07:35:00.000Z', productKey: 'pepsi-zero-355', productName: '펩시제로캔355ml', brand: 'EMART24', storeId: 'demo-emart24-sindang-station', placeName: '이마트24 신당역점', qty: 2, paid: 1890, listPrice: 4200, saved: 2310,
        lines: [{ ...event, amount: 2100 }, { ...shinhan, amount: 210 }] }
];

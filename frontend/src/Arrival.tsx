// 추가 화면 v3 2 · 3 · 4번: 도착 화면 · 「가계부에 적기」 시트(영수증 합계 + 1+1 상품으로 거꾸로 계산)
import { useLayoutEffect, useRef, useState } from 'react';
import type { EventItem, Plan, Receipt } from './ledgerData';
import { byParticle, objectParticle, reverse } from './ledgerData';
import { events } from './Products';
import type { Brand, Event, Store } from './types';
import { BrandIcon, Icon, Sheet, labels, won } from './ui';

/** 이번 결제에 바로 여는 할인 앱: 바코드(통신사 · 편의점 멤버십) → 간편결제 순 */
export function appButtonLabel(plan: Plan) {
    const barcode = plan.methods.find(method => method.kind === 'TELECOM' || method.kind === 'MEMBERSHIP');
    if (barcode) return { code: barcode.code, text: `${barcode.label} 바코드 열기` };
    const pay = plan.methods.find(method => method.kind === 'PAY');
    return pay ? { code: pay.code, text: `${pay.label} 열기` } : null;
}

/** 「계산 전에」 할 일: 상품 찾기(행사면 개수) → 바코드 먼저 → 결제 수단 */
function Steps({ plan }: { plan: Plan }) {
    const ordered = [...plan.methods].sort((a, b) => rank(a.kind) - rank(b.kind));
    return <ul className="arrival-steps">
        <li>{plan.event !== 'NONE'
            ? <><b>{plan.productName}</b> {plan.qty}개를 챙기세요 ({events[plan.event]} 행사)</>
            : <><b>{plan.productName}</b>{objectParticle(plan.productName)} 찾으세요</>}</li>
        {ordered.map(method => <li key={`${method.kind}-${method.code}`}>{stepText(method.kind, method.label)}{method.amount > 0 && <em> -{won(method.amount)}원</em>}</li>)}
    </ul>;
}
const rank = (kind: string) => ({ TELECOM: 0, MEMBERSHIP: 1, CARD: 2, PAY: 3 }[kind] ?? 4);
function stepText(kind: string, label: string) {
    if (kind === 'TELECOM' || kind === 'MEMBERSHIP') return `${label} 바코드를 먼저 보여 주세요`;
    return `${label}${byParticle(label)} 결제하세요`;
}

/** 2번: 매장 30m 안에 들어오면 저절로 열리는 도착 화면(「도착했어요」 버튼으로도 연다) */
export function ArrivalView({ plan, saved, bought, skip }: { plan: Plan; saved: number; bought: () => void; skip: () => void }) {
    const [opened, setOpened] = useState(false);
    const app = appButtonLabel(plan);
    return <section className="arrival" aria-label="도착 화면">
        <header className="arrival-title"><BrandIcon code={plan.brand} /><div><small>도착했어요</small><h1>{plan.placeName}</h1></div></header>
        <div className="arrival-box">
            <h2>계산 전에</h2>
            <Steps plan={plan} />
            {app && <button type="button" className="secondary app-open" onClick={() => setOpened(true)}><BrandIcon code={app.code} size="xs" />{app.text}</button>}
            {opened && <p className="arrival-note" role="status">예시 화면이라 실제 앱은 열지 않아요</p>}
            <div className="arrival-row total"><span>예상 결제</span><b>{won(plan.pay)}원</b></div>
        </div>
        <div className="arrival-box">
            <div className="arrival-row"><span>정가보다 이번에</span><b className="big">{won(plan.saved)}원</b></div>
            <div className="arrival-row"><span>지금까지 아낀 돈</span><b>{won(saved)}원</b></div>
        </div>
        <p className="arrival-note left">「샀어요」를 누르면 가계부에 적어 둬요. 가격은 수집 시점의 브랜드 가격이라 매장마다 다를 수 있어요.</p>
        <button type="button" className="primary" onClick={bought}>샀어요</button>
        <button type="button" className="secondary" onClick={skip}>이번엔 안 샀어요</button>
    </section>;
}

interface Row { name: string; event: Exclude<Event, 'NONE'>; price: string }
type StoreChoice = { brand: Brand; storeId: string; placeName: string };
const MAX_DIGITS = 7;

/**
 * 쉼표가 붙는 금액 입력칸. 값은 숫자 문자열(「3000」), 화면은 「3,000」.
 * 쉼표가 생기고 사라져도 커서가 맨 끝으로 튀지 않게 커서 왼쪽 숫자 개수로 자리를 되돌리고,
 * 쉼표 바로 뒤에서 지우면(쉼표만 지워짐) 그 앞 숫자를 지운다.
 */
function MoneyInput({ value, change, label, placeholder }: { value: string; change: (value: string) => void; label: string; placeholder?: string }) {
    const ref = useRef<HTMLInputElement>(null);
    const caret = useRef<number | null>(null); // 커서 왼쪽 숫자 개수
    const shown = value && won(Number(value));
    useLayoutEffect(() => {
        const input = ref.current;
        if (!input || caret.current === null || document.activeElement !== input) return;
        let seen = 0, at = 0;
        while (at < input.value.length && seen < caret.current) { if (/\d/.test(input.value[at])) seen++; at++; }
        input.setSelectionRange(at, at); caret.current = null;
    });
    return <input ref={ref} inputMode="numeric" aria-label={label} placeholder={placeholder} value={shown} onChange={event => {
        const raw = event.target.value; const position = event.target.selectionStart ?? raw.length;
        let next = raw.replace(/\D/g, ''); let left = raw.slice(0, position).replace(/\D/g, '').length;
        if (next === value && raw.length < shown.length && left > 0) { next = next.slice(0, left - 1) + next.slice(left); left--; }
        const trimmed = next.replace(/^0+(?=\d)/, ''); left = Math.max(0, left - (next.length - trimmed.length));
        caret.current = Math.min(left, MAX_DIGITS); change(trimmed.slice(0, MAX_DIGITS));
    }} />;
}

/**
 * 3 · 4번 「가계부에 적기」. 장바구니 없이 낸 돈 합계와 1+1 · 2+1로 산 상품(이름 · 정가)만 받아
 * 통신사 · 카드 할인을 거꾸로 계산한다. 도착 화면에서 열면 앱 계산값으로 미리 채우고,
 * 가계부의 「영수증으로 직접 적기」로 열면 매장을 고른다.
 */
export function RecordSheet({ store, stores = [], initial, telecom, cards, close, save }: {
    store: StoreChoice | null; stores?: StoreChoice[];
    initial: { paid: number | null; items: EventItem[]; telecom: boolean; card: string };
    telecom: { code: string; label: string } | null; cards: { code: string; label: string }[];
    close: () => void; save: (receipt: Receipt, store: StoreChoice) => void;
}) {
    const choices = store ? [store] : stores.length ? stores : (['GS25', 'CU', 'SEVEN', 'EMART24'] as Brand[]).map(brand => ({ brand, storeId: `manual-${brand.toLowerCase()}`, placeName: labels[brand] }));
    const [storeId, setStoreId] = useState(choices[0].storeId);
    const [paid, setPaid] = useState(initial.paid === null ? '' : String(initial.paid));
    const [rows, setRows] = useState<Row[]>(initial.items.map(item => ({ ...item, price: String(item.price) })));
    const [usedTelecom, setUsedTelecom] = useState(initial.telecom && !!telecom);
    const [card, setCard] = useState(initial.card);
    const chosen = choices.find(value => value.storeId === storeId) ?? choices[0];
    const items: EventItem[] = rows.filter(row => row.name.trim() && Number(row.price) > 0).map(row => ({ name: row.name.trim(), event: row.event, price: Number(row.price) }));
    const paidNumber = Number(paid);
    // 행사 상품 줄은 비워 두거나(무시) 이름 · 정가를 다 채워야 한다
    const halfRow = rows.some(row => !!row.name.trim() !== Number(row.price) > 0);
    const methods = { telecom: usedTelecom ? telecom : null, card: cards.find(value => value.code === card) ?? null };
    // 낸 돈(카드 할인 전)이 행사 상품 값보다 적으면 영수증과 맞지 않는다
    const check = reverse({ paid: paidNumber, items, ...methods });
    const short = paidNumber > 0 && check.beforeCard < check.eventPaid;
    const valid = paidNumber > 0 && !halfRow && !short;
    const receipt: Receipt = { paid: valid ? paidNumber : 0, items, ...methods };
    const result = reverse(receipt);
    const update = (index: number, patch: Partial<Row>) => setRows(list => list.map((row, at) => at === index ? { ...row, ...patch } : row));
    return <Sheet title="가계부에 적기" close={close}>
        {store ? <div className="paid-product"><BrandIcon code={store.brand} size="s" /><strong>{store.placeName}</strong></div>
            : <label className="paid-row"><span>산 매장</span><select className="record-select" aria-label="산 매장" value={storeId} onChange={event => setStoreId(event.target.value)}>
                {choices.map(value => <option key={value.storeId} value={value.storeId}>{value.placeName}</option>)}</select></label>}
        <label className="paid-row"><span>낸 돈 합계</span><span className="paid-input"><MoneyInput label="낸 돈 합계" value={paid} change={setPaid} /><small>원</small></span></label>
        <div className="record-group">
            <h3>1+1 · 2+1로 산 상품</h3>
            {rows.map((row, index) => <div key={index} className="event-row">
                <input aria-label={`행사 상품 ${index + 1} 이름`} placeholder="상품 이름" value={row.name} maxLength={40} onChange={event => update(index, { name: event.target.value })} />
                <select aria-label={`행사 상품 ${index + 1} 행사`} value={row.event} onChange={event => update(index, { event: event.target.value as Row['event'] })}>
                    {(['ONE_PLUS_ONE', 'TWO_PLUS_ONE', 'THREE_PLUS_ONE'] as const).map(value => <option key={value} value={value}>{events[value]}</option>)}</select>
                <span className="paid-input small"><MoneyInput label={`행사 상품 ${index + 1} 정가`} placeholder="정가" value={row.price} change={price => update(index, { price })} /><small>원</small></span>
                <button type="button" className="icon-button" aria-label={`행사 상품 ${index + 1} 빼기`} onClick={() => setRows(list => list.filter((_, at) => at !== index))}><Icon name="icons/x" size={16} /></button>
            </div>)}
            <button type="button" className="add-event" onClick={() => setRows(list => [...list, { name: '', event: 'ONE_PLUS_ONE', price: '' }])}><Icon name="icons/plus" size={14} />행사 상품 추가</button>
            {halfRow && <p className="record-hint" role="alert">행사 상품은 이름과 정가를 모두 적어 주세요</p>}
            {!halfRow && short && <p className="record-hint" role="alert">낸 돈이 행사 상품 값({won(check.eventPaid)}원)보다 적어요. 금액을 확인해 주세요</p>}
        </div>
        {(telecom || cards.length > 0) && <div className="record-group">
            <h3>쓴 할인</h3>
            {telecom && <label className="check-row"><input type="checkbox" checked={usedTelecom} onChange={event => setUsedTelecom(event.target.checked)} />{telecom.label} 바코드 보여 줬어요</label>}
            {cards.length > 0 && <label className="paid-row plain"><span>결제한 카드</span><select className="record-select" aria-label="결제한 카드" value={card} onChange={event => setCard(event.target.value)}>
                <option value="">카드 할인 없음</option>{cards.map(value => <option key={value.code} value={value.code}>{value.label}</option>)}</select></label>}
        </div>}
        <div className="paid-result" role="status">
            {result.lines.map(line => <div key={`${line.kind}-${line.code}`} className="arrival-row"><span>{line.label}</span><b>{won(line.amount)}원</b></div>)}
            <div className="arrival-row total"><span>이번에 아낀 돈</span><strong>{won(result.saved)}원</strong></div>
        </div>
        <button type="button" className="primary" disabled={!valid} onClick={() => save(receipt, chosen)}>가계부에 적기</button>
        <p className="arrival-note left">통신사 · 카드 할인은 낸 돈으로 거꾸로 계산한 값이에요. 통신사 할인은 1,000원 단위라 한 칸(최대 100원) 덜 잡힐 수 있어요</p>
    </Sheet>;
}
export type { StoreChoice };
export const storeChoices = (stores: Store[]): StoreChoice[] => stores.map(store => ({ brand: store.brand, storeId: store.storeId, placeName: store.placeName }));

import { useEffect, useState } from 'react';
import { api } from './api';
import type { Brand, Card, CardIssuer, MethodType, Pay, Telecom, TelecomGrade, Wallet, WalletOptions } from './types';
import { BrandIcon, Icon, Notice, Sheet, errorMessage, labels } from './ui';

export interface WalletEntry { type: MethodType; key: string; name: string; code: string; grade?: TelecomGrade; card?: Card }
const kinds: { type: MethodType; label: string; code: string; help: string }[] = [
    { type: 'TELECOM', label: '통신사 멤버십', code: 'SKT', help: 'SKT · KT · LG U+' },
    { type: 'CARD', label: '신용·체크카드', code: 'CARD', help: '상품 선택 또는 직접 입력' },
    { type: 'PAY', label: '간편결제', code: 'KAKAOPAY', help: '카카오 · 네이버 · 토스 · 삼성' },
    { type: 'MEMBERSHIP', label: '편의점 멤버십', code: 'CU', help: 'CU · GS25 · 세븐 · 이마트24' }
];
export function walletEntries(wallet: Wallet, options: WalletOptions | null): WalletEntry[] {
    return [
        ...(wallet.telecom ? [{ type: 'TELECOM' as const, key: 'telecom', name: labels[wallet.telecom.provider], code: wallet.telecom.provider, grade: wallet.telecom.grade }] : []),
        ...wallet.cards.map((card, index) => ({ type: 'CARD' as const, key: `card-${index}`, name: card.name ?? options?.cards.find(option => option.cardId === card.cardId)?.name ?? `${labels[card.issuer]} 카드`, code: card.issuer, card })),
        ...wallet.pays.map(code => ({ type: 'PAY' as const, key: code, name: labels[code], code })),
        ...wallet.memberships.map(code => ({ type: 'MEMBERSHIP' as const, key: code, name: options?.memberships.find(option => option.brand === code)?.name ?? `${labels[code]} 멤버십`, code }))
    ];
}
export function removeEntry(wallet: Wallet, entry: WalletEntry): Wallet {
    return { ...wallet,
        telecom: entry.type === 'TELECOM' ? null : wallet.telecom,
        cards: entry.type === 'CARD' ? wallet.cards.filter((_, index) => entry.key !== `card-${index}`) : wallet.cards,
        pays: entry.type === 'PAY' ? wallet.pays.filter(code => code !== entry.code) : wallet.pays,
        memberships: entry.type === 'MEMBERSHIP' ? wallet.memberships.filter(code => code !== entry.code) : wallet.memberships
    };
}
export function WalletView({ wallet, update }: { wallet: Wallet; update: (wallet: Wallet) => boolean }) {
    const [options, setOptions] = useState<WalletOptions | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [reload, setReload] = useState(0);
    const [form, setForm] = useState<{ entry?: WalletEntry } | null>(null);
    const [deleting, setDeleting] = useState<WalletEntry | null>(null);
    useEffect(() => {
        const controller = new AbortController();
        api.walletOptions(controller.signal).then(setOptions).catch(error => { if (!controller.signal.aborted) setError(errorMessage(error)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [reload]);
    const entries = walletEntries(wallet, options);
    return <section className="wallet-page"><header className="wallet-header"><span className="logo">편리</span><h1>내 할인 수단</h1></header>
        {entries.length ? <div className="wallet-list">{entries.map(entry => <div className="wallet-row" key={`${entry.type}-${entry.key}`}><BrandIcon code={entry.code} /><div className="wallet-details"><span>{kinds.find(kind => kind.type === entry.type)?.label}</span><strong>{entry.name} {entry.grade && <span className="event-badge">{labels[entry.grade]}</span>}</strong></div><button className="edit" aria-label={`${entry.name} 수정`} onClick={() => setForm({ entry })}>수정</button><button className="delete" aria-label={`${entry.name} 삭제`} onClick={() => setDeleting(entry)}>삭제</button></div>)}<div className="wallet-add"><button className="primary" onClick={() => setForm({})}><Icon name="plus" size={18} />할인 수단 추가</button></div><p className="device-notice">등록해 두면 매장마다 쓸 수 있는 할인을 표시해요.<br />이 기기에만 저장돼요.</p></div>
            : <div className="wallet-empty"><div className="zero-tag"><b>0</b><span>개</span></div><h2>아직 등록한 할인 수단이 없어요</h2><p>통신사·카드·간편결제·편의점 멤버십을 등록하면<br />매장마다 쓸 수 있는 할인을 보여 드려요</p><button className="primary" onClick={() => setForm({})}><Icon name="plus" size={18} />할인 수단 추가</button></div>}
        {form && <Sheet title={`할인 수단 ${form.entry ? '수정' : '추가'}`} close={() => setForm(null)}>{loading ? <Notice>선택지를 불러오고 있어요…</Notice> : error || !options ? <Notice retry={() => { setError(''); setLoading(true); setReload(value => value + 1); }}>{error || '선택지를 불러오지 못했어요'}</Notice> : <WalletForm wallet={wallet} options={options} entry={form.entry} cancel={() => setForm(null)} save={next => { if (update(next)) setForm(null); }} />}</Sheet>}
        {deleting && <Sheet title={`${deleting.name}을 삭제할까요?`} close={() => setDeleting(null)}><p className="sheet-description">삭제하면 매장 목록에서 {deleting.name} 할인 아이콘이 더 이상 표시되지 않아요.</p><div className="sheet-actions"><button className="secondary" onClick={() => setDeleting(null)}>취소</button><button className="danger" onClick={() => { if (update(removeEntry(wallet, deleting))) setDeleting(null); }}>삭제</button></div></Sheet>}
    </section>;
}
function WalletForm({ wallet, options, entry, cancel, save }: { wallet: Wallet; options: WalletOptions; entry?: WalletEntry; cancel: () => void; save: (wallet: Wallet) => void }) {
    const [type, setType] = useState<MethodType>(entry?.type ?? 'TELECOM');
    const [choice, setChoice] = useState(entry?.type === 'CARD' ? entry.card?.cardId ?? 'direct' : entry?.code ?? '');
    const [grade, setGrade] = useState<TelecomGrade>(entry?.grade ?? 'UNKNOWN');
    const [name, setName] = useState(entry?.card?.name ?? '');
    const [issuer, setIssuer] = useState<CardIssuer | ''>(entry?.card?.issuer ?? '');
    const [filter, setFilter] = useState('');
    const [error, setError] = useState('');
    const base = entry ? removeEntry(wallet, entry) : wallet;
    const duplicate = (value: string) => type === 'TELECOM' ? !!base.telecom
        : type === 'PAY' ? base.pays.includes(value as Pay)
        : type === 'MEMBERSHIP' ? base.memberships.includes(value as Brand)
        : base.cards.some(card => card.cardId === value);
    function submit(event: React.FormEvent) {
        event.preventDefault();
        if (!choice || (type === 'CARD' && choice === 'direct' && (!issuer || !name.trim()))) { setError('필수 입력을 모두 선택해 주세요'); return; }
        if (choice !== 'direct' && duplicate(choice)) { setError(type === 'TELECOM' ? '통신사 멤버십은 하나만 등록할 수 있어요. 등록된 수단을 수정해 주세요.' : '이미 등록한 할인 수단이에요'); return; }
        const next: Wallet = { ...base };
        if (type === 'TELECOM') next.telecom = { provider: choice as Telecom, grade };
        if (type === 'PAY') next.pays = [...base.pays, choice as Pay];
        if (type === 'MEMBERSHIP') next.memberships = [...base.memberships, choice as Brand];
        if (type === 'CARD') {
            const card = choice === 'direct' ? { cardId: null, name: name.trim(), issuer: issuer as CardIssuer } : options.cards.find(card => card.cardId === choice);
            if (!card) { setError('카드 상품을 선택해 주세요'); return; }
            if (base.cards.some(value => value.cardId === null && card.cardId === null && value.name === card.name && value.issuer === card.issuer)) { setError('이미 등록한 카드예요'); return; }
            next.cards = [...base.cards, card.cardId ? { cardId: card.cardId, issuer: card.issuer } : card];
        }
        save(next);
    }
    const choices = type === 'TELECOM' ? options.telecoms.map(option => ({ code: option.code, name: option.name }))
        : type === 'PAY' ? options.pays : type === 'MEMBERSHIP' ? options.memberships.map(option => ({ code: option.brand, name: option.name }))
        : options.cards.filter(card => card.name.toLowerCase().includes(filter.toLowerCase())).map(card => ({ code: card.cardId, name: card.name, icon: card.issuer }));
    return <form className="wallet-form" onSubmit={submit}><fieldset><legend>종류</legend><div className="kind-grid">{kinds.map(kind => <button type="button" key={kind.type} aria-pressed={type === kind.type} className={`kind ${type === kind.type ? 'active' : ''}`} onClick={() => { setType(kind.type); setChoice(''); setError(''); }}><BrandIcon code={kind.code} size={24} /><strong>{kind.label}</strong><small>{kind.help}</small></button>)}</div></fieldset>
        <fieldset><legend>{kinds.find(kind => kind.type === type)?.label}</legend>
            {type === 'CARD' && <><label className="sr-only" htmlFor="card-search">카드 상품명 검색</label><input id="card-search" placeholder="카드 상품명 검색" value={filter} onChange={event => setFilter(event.target.value)} /><button type="button" className={`direct-choice ${choice === 'direct' ? 'active' : ''}`} aria-pressed={choice === 'direct'} onClick={() => setChoice('direct')}>직접 입력</button></>}
            <div className={`choice-grid ${type === 'CARD' ? 'card-choices' : ''}`}>{choices.map(option => <button type="button" key={option.code} aria-label={option.name} disabled={duplicate(option.code)} aria-pressed={choice === option.code} className={`choice ${choice === option.code ? 'active' : ''}`} onClick={() => setChoice(option.code)}><BrandIcon code={'icon' in option ? String(option.icon) : option.code} size={24} /><span>{option.name}</span>{duplicate(option.code) && <small>등록됨</small>}</button>)}</div>
            {type === 'TELECOM' && choice && <div className="grade-options"><span>등급</span>{options.telecoms.find(telecom => telecom.code === choice)?.grades.map(value => <button type="button" className={`chip ${grade === value ? 'active' : ''}`} aria-pressed={grade === value} key={value} onClick={() => setGrade(value)}>{labels[value]}</button>)}</div>}
            {type === 'CARD' && choice === 'direct' && <div className="direct-card"><label>카드 이름<input maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="카드 상품명" /></label><label>카드사<select value={issuer} onChange={event => setIssuer(event.target.value as CardIssuer)}><option value="">카드사를 선택해 주세요</option>{options.cardIssuers.map(option => <option key={option.code} value={option.code}>{option.name}</option>)}</select></label></div>}
        </fieldset>{error && <p role="alert" className="form-error">{error}</p>}<div className="sheet-actions"><button type="button" className="secondary" onClick={cancel}>취소</button><button type="submit" className="primary">{entry ? '저장' : '추가'}</button></div>
    </form>;
}


import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { isBundleEvent } from './types';
import type { RecentItem } from './storage';
import type { Brand, Destination, MethodType, Product, QuoteResponse, QuoteStore, Sort, Store, Wallet } from './types';
import { BrandIcon, Icon, Logo, Notice, Price, PriceLine, labels, logoUrl, won } from './ui';

export const events = { NONE: '', OTHER: '', ONE_PLUS_ONE: '1+1', TWO_PLUS_ONE: '2+1', THREE_PLUS_ONE: '3+1' };
const OUT_TEXT = '재고 없음 · 예시 데이터';
/** 추가 화면 v3 7번: 재고는 적을 때(2개 이하)만 주황 점 + 「재고 적음」. 있음은 표시 없음, 개수는 보여 주지 않는다 */
export function LowStock({ store }: { store: QuoteStore }) {
    return store.stockStatus === 'LOW' ? <span className="low-stock">재고 적음</span> : null;
}
/** 1+1 · 2+1 묶음 개수(「2개 사면」) */
const bundleCount = { NONE: 1, OTHER: 1, ONE_PLUS_ONE: 2, TWO_PLUS_ONE: 3, THREE_PLUS_ONE: 4 };
export const categories = [
    { label: '음료', icon: 'cup' }, { label: '라면', icon: 'ramen' }, { label: '삼각김밥', icon: 'riceball' },
    { label: '도시락', icon: 'bento' }, { label: '과자', icon: 'snack' }, { label: '커피', icon: 'coffee' }
];

/** 매장 이름에서 브랜드 접두어를 뺀 짧은 이름(「CU 성수연무장점」 → 「성수연무장점」) */
export const shortPlace = (store: { brand: Brand; placeName: string }) => {
    const prefix = [labels[store.brand], store.brand].find(value => store.placeName.startsWith(value));
    return prefix ? store.placeName.slice(prefix.length).trim() || store.placeName : store.placeName;
};
export function ProductImage({ imageUrl, productKey, className = '' }: { imageUrl: string | null; productKey: string; className?: string }) {
    const [failed, setFailed] = useState(false);
    const fallback = productKey === 'binggrae-banana-240' ? '/assets/banana.svg'
        : productKey === 'maeil-barista-latte-325' ? '/assets/latte.svg' : null;
    const source = (!failed && imageUrl) || fallback;
    return <span className={`product-image ${className}`}>{source ? <img src={source} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} /> : <span className="image-placeholder" aria-label="상품 이미지 없음"><Icon name="box" size={24} /></span>}</span>;
}

/** CARD 코드는 카드 ID라서 저장된 wallet에서 카드사를 찾는다. 못 찾으면 「카드」 */
function methodCode(method: { type: MethodType; code: string }, wallet: Wallet) {
    if (method.type !== 'CARD') return method.code;
    return wallet.cards.find(card => card.cardId === method.code)?.issuer ?? 'CARD';
}
function Methods({ store, wallet }: { store: QuoteStore; wallet: Wallet }) {
    if (!store.applicableMethods.length) return null;
    const rest = store.applicableMethods.length - 2;
    return <div className="method-icons" aria-label="쓸 수 있는 할인 수단"><small>내 수단</small>{store.applicableMethods.slice(0, 2).map(method => <Logo key={`${method.type}-${method.code}`} code={methodCode(method, wallet)} className="method" />)}{rest > 0 && <small className="more-methods">+{rest}</small>}</div>;
}

/** 강조 카드 라벨: 위에서부터 먼저 맞는 것 1개 */
export function featuredLabel(product: Product, featured: QuoteStore, isDestination: boolean) {
    if (isDestination) return '목적지';
    const open = product.stores.filter(store => store.stockStatus !== 'OUT');
    if (!open.length || product.storeCount === 1) return null;
    const nearest = Math.min(...open.map(store => store.distanceM));
    return product.stores[0].stockStatus !== 'OUT' && product.stores[0].distanceM === nearest ? '최저가 · 가장 가까움' : '최저가';
}
/** 강조 카드 기준 차이 문구. 분 차이 = walkMin 차이 */
export function diffText(featured: QuoteStore, other: QuoteStore) {
    if (other.stockStatus === 'OUT') return OUT_TEXT;
    const price = other.unitPrice - featured.unitPrice; const minutes = other.walkMin - featured.walkMin;
    const won_ = `${won(Math.abs(price))}원`; const min = `약 ${Math.abs(minutes)}분`;
    if (price === 0) return minutes > 0 ? `같은 가격인데 ${min} 더 걸려요` : minutes < 0 ? `같은 가격이고 ${min} 가까워요` : '같은 가격, 비슷한 거리예요';
    if (price > 0) return minutes < 0 ? `${won_} 더 비싸지만 ${min} 가까워요` : `${won_} 더 비싸요`;
    return minutes > 0 ? `${won_} 더 싸지만 ${min} 더 걸려요` : `${won_} 더 싸요`;
}

function FeaturedCard({ product, store, label, isDestination, wallet, select }: {
    product: Product; store: QuoteStore; label: string | null; isDestination: boolean; wallet: Wallet; select: () => void;
}) {
    const allOut = product.stores.every(value => value.stockStatus === 'OUT');
    return <div className="featured-card pressable" onClick={select}>
        {label && <p className="featured-label">{label}</p>}
        <div className="featured-title"><BrandIcon code={store.brand} /><div><strong>{store.placeName}</strong><small>도보 약 {store.walkMin}분 · {store.distanceM}m <LowStock store={store} /></small>{(store.stockStatus === 'OUT' || allOut) && <small className="diff out">{OUT_TEXT}</small>}</div>
            <button type="button" className="primary small">{isDestination ? '지도 보기' : '길찾기'}</button></div>
        <Methods store={store} wallet={wallet} />
        {isBundleEvent(store.event) && <p className="bundle-pay"><span>{bundleCount[store.event]}개 사면</span><b>예상 결제 약 {won(store.unitPrice * bundleCount[store.event])}원</b></p>}
    </div>;
}
function OtherStores({ featured, others, choose }: { featured: QuoteStore; others: QuoteStore[]; choose: (store: QuoteStore) => void }) {
    const [open, setOpen] = useState(false);
    return <>
        <button type="button" className={`other-toggle ${open ? 'open' : ''}`} aria-expanded={open} onClick={() => setOpen(value => !value)}>
            <span>{!open && <Logo code={others[0].brand} />}<strong>다른 매장 {others.length}곳</strong>{!open && <small>{diffText(featured, others[0])}</small>}</span>
            <Icon name={open ? 'icons/caret-up' : 'icons/caret-down'} size={14} />
        </button>
        {open && <div className="other-list expand">{others.map(store => <button type="button" key={store.storeId} className={`store-row pressable ${store.stockStatus === 'OUT' ? 'is-out' : ''}`} onClick={() => choose(store)}>
            <BrandIcon code={store.brand} size="s" />
            <span className="store-details"><strong>{store.placeName}</strong><span>도보 약 {store.walkMin}분 · {store.distanceM}m <LowStock store={store} /></span><span className={`diff ${store.stockStatus === 'OUT' ? 'out' : ''}`}>{diffText(featured, store)}</span></span>
            <Price price={store.unitPrice} size="row" />
        </button>)}</div>}
    </>;
}
function ProductCard({ product, open, toggle, destination, wallet, choose }: {
    product: Product; open: boolean; toggle: () => void; destination: Destination | null; wallet: Wallet; choose: (store: QuoteStore) => void;
}) {
    const destinationStore = destination?.productKey === product.productKey ? product.stores.find(store => store.storeId === destination.storeId) : undefined;
    // 접힌 카드 = 현재 최저가 매장(stores[0]), 펼친 카드 = 목적지를 우선 강조
    const cheapest = product.stores[0];
    const featured = destinationStore ?? cheapest;
    // 재고 없는 매장은 회색으로 맨 아래
    const others = product.stores.filter(store => store !== featured).sort((a, b) => Number(a.stockStatus === 'OUT') - Number(b.stockStatus === 'OUT'));
    return <article className={`product ${open ? 'open' : ''}`}>
        <button className="product-row pressable" aria-expanded={open} onClick={toggle}>
            <ProductImage imageUrl={product.imageUrl} productKey={product.productKey} className={open ? 'big' : ''} />
            <span className="product-info"><strong>{product.name}</strong>
                <span className="product-meta">{isBundleEvent(product.event) && <b className="event">{events[product.event]}</b>}<s>정가 {won(product.listPrice)}원</s></span>
                <PriceLine price={product.minUnitPrice} listPrice={product.listPrice} size={open ? 'strong' : 'list'} />
                {!open && cheapest && <span className="where"><Logo code={cheapest.brand} /><span>{shortPlace(cheapest)} · 도보 {cheapest.walkMin}분</span><LowStock store={cheapest} /></span>}
            </span>
            <span className="chev"><Icon name={open ? 'icons/caret-up' : 'icons/caret-down'} size={14} /></span>
        </button>
        {open && featured && <>
            <div className="product-stores expand" aria-label={`${product.name} 매장 목록`}>
                <FeaturedCard product={product} store={featured} label={featuredLabel(product, featured, !!destinationStore)} isDestination={!!destinationStore} wallet={wallet} select={() => choose(featured)} />
            </div>
            {product.storeCount > 1 && others.length > 0 && <OtherStores key={featured.storeId} featured={featured} others={others} choose={choose} />}
        </>}
    </article>;
}

/** P1 첫 화면: 품목 칸 · 할인 수단 요약 · 최근 찾은 상품 · 내 주변 편의점 */
export function Home({ wallet, recent, nearby, search, openRecent, goWallet, goMap, saved = null, goLedger }: {
    wallet: Wallet; recent: RecentItem[]; nearby: Store[]; search: (q: string) => void; openRecent: (item: RecentItem) => void; goWallet: () => void; goMap: () => void;
    /** 추가 화면 v3 6번 「지금까지 아낀 돈」. 가계부 기록이 없으면 null(줄을 숨김) */
    saved?: number | null; goLedger?: () => void;
}) {
    const codes: string[] = [...(wallet.telecom ? [wallet.telecom.provider] : []), ...wallet.cards.map(card => card.issuer), ...wallet.pays, ...wallet.memberships];
    return <div className="home">
        <div className="tiles">{categories.map(item => <button key={item.label} className="tile pressable" onClick={() => search(item.label)}><img src={`/assets/category/${item.icon}.png`} alt="" /><b>{item.label}</b></button>)}</div>
        <button className="wallet-summary pressable" onClick={goWallet}><strong>할인 수단</strong><small>{codes.length ? `${codes.length}개 등록` : '등록하고 내 기준 가격 보기'}</small>
            <span className="logos">{codes.filter(code => logoUrl(code)).slice(0, 3).map(code => <img key={code} src={logoUrl(code)!} alt="" />)}</span><Icon name="icons/caret-right" size={14} /></button>
        {saved !== null && goLedger && <button className="wallet-summary saved-summary pressable" onClick={goLedger}><span>지금까지 아낀 돈</span><b>{won(saved)}원</b><Icon name="icons/caret-right" size={14} /></button>}
        {recent.length > 0 && <section className="near"><h3>최근 찾은 상품</h3><DragRow className="recent-row">{recent.map(item => <button key={item.productKey} className="recent-card pressable" onClick={() => openRecent(item)}>
            <span className="product-image wide">{isBundleEvent(item.event) && <em>{events[item.event]}</em>}<ProductImageInner item={item} /></span>
            <span className="recent-name">{item.name}</span>
            <PriceLine price={item.unitPrice} listPrice={item.listPrice} size="small" unit={false} />
            <Logo code={item.brand} />
        </button>)}</DragRow></section>}
        {nearby.length > 0 && <section className="near"><h3>내 주변 편의점</h3><div className="near-list">{nearby.map(store => <button key={store.storeId} className="near-row" onClick={goMap}>
            <BrandIcon code={store.brand} size="s" /><span className="store-details"><strong>{store.placeName}</strong><span>도보 약 {store.walkMin}분 · {store.distanceM}m</span></span><Icon name="icons/caret-right" size={14} />
        </button>)}</div></section>}
    </div>;
}
/**
 * 가로로 넘기는 줄. 휴대폰은 손가락으로 밀면 되지만 PC 마우스는 끌어도 안 넘어가서, 마우스로 끌면 옆으로 넘긴다.
 * 5px 넘게 끌었으면 손을 뗄 때의 클릭(카드 열기)은 막는다. 터치 · 펜은 브라우저 기본 스크롤 그대로
 */
export function DragRow({ className, children }: { className: string; children: ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const row = ref.current; if (!row) return;
        let pointer: number | null = null, startX = 0, startLeft = 0, dragged = false;
        const down = (event: PointerEvent) => {
            if (event.pointerType !== 'mouse' || event.button !== 0) return;
            pointer = event.pointerId; startX = event.clientX; startLeft = row.scrollLeft; dragged = false;
        };
        const move = (event: PointerEvent) => {
            if (pointer !== event.pointerId) return;
            const dx = event.clientX - startX;
            if (!dragged && Math.abs(dx) < 5) return;
            if (!dragged) { dragged = true; row.setPointerCapture?.(event.pointerId); row.classList.add('dragging'); }
            row.scrollLeft = startLeft - dx;
        };
        const up = (event: PointerEvent) => {
            if (pointer !== event.pointerId) return;
            pointer = null; row.classList.remove('dragging');
            if (row.hasPointerCapture?.(event.pointerId)) row.releasePointerCapture(event.pointerId);
        };
        const click = (event: MouseEvent) => { if (dragged) { event.preventDefault(); event.stopPropagation(); dragged = false; } };
        row.addEventListener('pointerdown', down); row.addEventListener('pointermove', move);
        row.addEventListener('pointerup', up); row.addEventListener('pointercancel', up); row.addEventListener('click', click, true);
        return () => {
            row.removeEventListener('pointerdown', down); row.removeEventListener('pointermove', move);
            row.removeEventListener('pointerup', up); row.removeEventListener('pointercancel', up); row.removeEventListener('click', click, true);
        };
    }, []);
    return <div ref={ref} className={className}>{children}</div>;
}
function ProductImageInner({ item }: { item: RecentItem }) {
    const [failed, setFailed] = useState(false);
    const fallback = item.productKey === 'binggrae-banana-240' ? '/assets/banana.svg' : item.productKey === 'maeil-barista-latte-325' ? '/assets/latte.svg' : null;
    // 이미지 주소가 깨지면 상자 아이콘(검색 결과 카드와 같게)
    const source = (!failed && item.imageUrl) || fallback;
    return source ? <img src={source} alt="" loading="lazy" onError={() => setFailed(true)} /> : <Icon name="box" size={24} />;
}

export function Products({ result, busy, error, sort, changeSort, destination, wallet, choose, retry, expanded, toggle }: {
    result: QuoteResponse | null; busy: boolean; error: string; sort: Sort; changeSort: (sort: Sort) => void;
    destination: Destination | null; wallet: Wallet; choose: (product: Product, store: QuoteStore) => void; retry: () => void;
    expanded: string | null; toggle: (key: string | null) => void;
}) {
    if (busy) return <div className="skeleton-list" role="status" aria-label="상품을 검색하고 있어요">{[0, 1, 2, 3].map(index => <div key={index} className="skeleton-row"><i /><span><u /><u /><u /></span></div>)}</div>;
    if (error) return <Notice title={error} retry={retry} />;
    if (!result) return null;
    if (!result.products.length) return <Notice title="검색 결과 없음">상품 이름을 조금 다르게 검색해 보세요</Notice>;
    return <section aria-label="상품 검색 결과">
        <div className="result-summary"><span>검색 결과 <b>{result.products.length}</b></span><label className="sort-menu"><span className="sr-only">정렬</span><select value={sort} onChange={event => changeSort(event.target.value as Sort)}><option value="DISTANCE">거리순</option><option value="PRICE">가격 낮은순</option></select><Icon name="icons/caret-down" size={12} /></label></div>
        <div className="products">{result.products.map(product => <ProductCard key={product.productKey} product={product} open={expanded === product.productKey} toggle={() => toggle(expanded === product.productKey ? null : product.productKey)} destination={destination} wallet={wallet} choose={store => choose(product, store)} />)}</div>
        <p className="product-notice">매장마다 취급 상품이 다를 수 있음</p>
    </section>;
}

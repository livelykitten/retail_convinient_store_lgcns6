import { useState } from 'react';
import type { Destination, MethodType, Product, QuoteResponse, QuoteStore, Sort, Wallet } from './types';
import { BrandIcon, Icon, Notice, Price, labels, won } from './ui';

const events = { NONE: '', ONE_PLUS_ONE: '1+1', TWO_PLUS_ONE: '2+1', THREE_PLUS_ONE: '3+1' };
const OUT_TEXT = '재고 없음 · 예시 데이터';

function ProductImage({ product }: { product: Product }) {
    const [failed, setFailed] = useState(false);
    const fallback = product.productKey === 'binggrae-banana-240' ? '/assets/banana.svg'
        : product.productKey === 'maeil-barista-latte-325' ? '/assets/latte.svg' : null;
    const source = (!failed && product.imageUrl) || fallback;
    return <span className="product-image">{source ? <img src={source} alt="" onError={() => setFailed(true)} /> : <span className="image-placeholder" aria-label="상품 이미지 없음"><Icon name="box" size={24} /></span>}</span>;
}

/** CARD 코드는 카드 ID라서 저장된 wallet에서 카드사를 찾는다. 못 찾으면 「카드」 칩 */
function methodCode(method: { type: MethodType; code: string }, wallet: Wallet) {
    if (method.type !== 'CARD') return method.code;
    return wallet.cards.find(card => card.cardId === method.code)?.issuer ?? 'CARD';
}
function Methods({ store, wallet, size }: { store: QuoteStore; wallet: Wallet; size: number }) {
    if (!store.applicableMethods.length) return null;
    const rest = store.applicableMethods.length - 4;
    return <span className="method-icons" aria-label="쓸 수 있는 할인 수단">{store.applicableMethods.slice(0, 4).map(method => <BrandIcon key={`${method.type}-${method.code}`} code={methodCode(method, wallet)} size={size} />)}{rest > 0 && <span className="more-methods">+{rest}</span>}</span>;
}

/** 강조 카드 라벨: 위에서부터 먼저 맞는 것 1개 */
export function featuredLabel(product: Product, featured: QuoteStore, isDestination: boolean) {
    if (isDestination) return '목적지';
    const open = product.stores.filter(store => store.stockStatus !== 'OUT');
    if (!open.length || product.storeCount === 1) return null;
    const nearest = Math.min(...open.map(store => store.distanceM));
    return product.stores[0].stockStatus !== 'OUT' && product.stores[0].distanceM === nearest ? '가장 싸고 가까워요' : '가장 싸요';
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
        {label && <span className="badge">{label}</span>}
        <div className="featured-title"><BrandIcon code={store.brand} size={40} /><div><strong>{store.placeName}</strong>{store.event !== 'NONE' && <span className="badge">{store.eventLabel}</span>}</div></div>
        <div className="featured-price"><span className="featured-walk">도보 약 {store.walkMin}분 · {store.distanceM}m{(store.stockStatus === 'OUT' || allOut) && <span className="stock-out">{OUT_TEXT}</span>}</span><Price price={store.unitPrice} size="strong" mark /></div>
        <Methods store={store} wallet={wallet} size={20} />
        <button type="button" className="primary">{isDestination ? '지도에서 길 보기' : '여기로 길 안내'}</button>
    </div>;
}
function OtherStores({ featured, others, wallet, choose }: { featured: QuoteStore; others: QuoteStore[]; wallet: Wallet; choose: (store: QuoteStore) => void }) {
    const [open, setOpen] = useState(false);
    return <div className="other-stores">
        <button type="button" className="other-toggle" aria-expanded={open} onClick={() => setOpen(value => !value)}>
            <span><strong>다른 매장 {others.length}곳</strong><Icon name={open ? 'up' : 'down'} size={14} /></span>
            {!open && <small>{labels[others[0].brand]} · {diffText(featured, others[0])}</small>}
        </button>
        {open && <div className="other-list expand">{others.map(store => <button type="button" key={store.storeId} className="store-row pressable" onClick={() => choose(store)}>
            <BrandIcon code={store.brand} size={32} />
            <span className="store-details"><strong>{store.placeName}</strong><span>도보 약 {store.walkMin}분 · {store.distanceM}m</span><span>{diffText(featured, store)}</span><Methods store={store} wallet={wallet} size={20} /></span>
            <Price price={store.unitPrice} size="row" />
        </button>)}</div>}
    </div>;
}
function ProductStores({ product, destination, wallet, choose }: { product: Product; destination: Destination | null; wallet: Wallet; choose: (store: QuoteStore) => void }) {
    const destinationStore = destination?.productKey === product.productKey ? product.stores.find(store => store.storeId === destination.storeId) : undefined;
    const featured = destinationStore ?? product.stores[0];
    const others = product.stores.filter(store => store !== featured);
    return <div className="product-stores expand" aria-label={`${product.name} 매장 목록`}>
        <FeaturedCard product={product} store={featured} label={featuredLabel(product, featured, !!destinationStore)} isDestination={!!destinationStore} wallet={wallet} select={() => choose(featured)} />
        {product.storeCount > 1 && others.length > 0 && <OtherStores key={featured.storeId} featured={featured} others={others} wallet={wallet} choose={choose} />}
    </div>;
}
export function EmptySearch() {
    return <div className="empty-search"><h1>원하는 상품을 검색해 보세요.</h1><p>개당 최저가를 크게 보여 드려요.</p></div>;
}
export function Products({ result, busy, error, sort, changeSort, destination, wallet, choose, retry, expanded, toggle }: {
    result: QuoteResponse | null; busy: boolean; error: string; sort: Sort; changeSort: (sort: Sort) => void;
    destination: Destination | null; wallet: Wallet; choose: (product: Product, store: QuoteStore) => void; retry: () => void;
    expanded: string | null; toggle: (key: string | null) => void;
}) {
    if (busy) return <div className="skeleton-list" role="status" aria-label="상품을 검색하고 있어요">{[0, 1, 2].map(index => <div key={index} className="skeleton-row" />)}</div>;
    if (error) return <Notice retry={retry}>{error}</Notice>;
    if (!result) return <EmptySearch />;
    return <section aria-label="상품 검색 결과"><div className="result-summary"><span>'{result.query}' 검색 결과 {result.products.length}</span><label><span className="sr-only">정렬</span><select value={sort} onChange={event => changeSort(event.target.value as Sort)}><option value="DISTANCE">가까운 순</option><option value="PRICE">싼 순</option></select></label></div>
        {!result.products.length ? <Notice>검색 결과 없음</Notice> : result.products.map(product => <article key={product.productKey} className="product">
            <button className="product-row pressable" aria-expanded={expanded === product.productKey} onClick={() => toggle(expanded === product.productKey ? null : product.productKey)}>
                <ProductImage key={product.imageUrl ?? product.productKey} product={product} />
                <span className="product-info"><strong>{product.name}</strong><span className="product-meta">{product.event !== 'NONE' && <span className="badge">{events[product.event]}</span>}<span>정가 {won(product.listPrice)}원</span></span></span>
                <span className="lowest-price"><small>개당 최저가</small><Price price={product.minUnitPrice} size={expanded && expanded !== product.productKey ? 'row' : 'list'} /></span>
                <Icon name={expanded === product.productKey ? 'up' : 'down'} size={18} />
            </button>
            {expanded === product.productKey && <ProductStores product={product} destination={destination} wallet={wallet} choose={store => choose(product, store)} />}
        </article>)}<p className="product-notice">매장마다 취급 상품이 다를 수 있음</p>
    </section>;
}

import { useState } from 'react';
import type { Destination, Product, QuoteResponse, QuoteStore, Sort } from './types';
import { BrandIcon, Icon, Notice, PriceTag, won } from './ui';

const events = { NONE: '', ONE_PLUS_ONE: '1+1', TWO_PLUS_ONE: '2+1', THREE_PLUS_ONE: '3+1' };
const stock = { IN_STOCK: '있음', LOW: '적음', OUT: '없음' };
function ProductImage({ product }: { product: Product }) {
    const [failed, setFailed] = useState(false);
    const fallback = product.productKey === 'binggrae-banana-240' ? '/assets/banana.svg'
        : product.productKey === 'maeil-barista-latte-325' ? '/assets/latte.svg' : null;
    const source = (!failed && product.imageUrl) || fallback;
    return <span className="product-image">{source ? <img src={source} alt="" onError={() => setFailed(true)} /> : <span className="image-placeholder" aria-label="상품 이미지 없음">상품</span>}</span>;
}
function StoreRow({ store, selected, select }: { store: QuoteStore; selected: boolean; select: () => void }) {
    return <button className={`store-row ${selected ? 'selected' : ''} ${store.stockStatus === 'OUT' ? 'out' : ''}`} onClick={select}>
        <BrandIcon code={store.brand} size={30} /><span className="store-details">
            <span className="store-title"><strong>{store.placeName}</strong>{selected && <span className="destination-badge">목적지</span>}</span>
            <span className="store-meta">{store.event !== 'NONE' && <span className="event-badge">{store.eventLabel}</span>}<b>도보 약 {store.walkMin}분</b><span>{store.distanceM}m</span></span>
            <span className="method-icons">{store.applicableMethods.slice(0, 4).map(method => <BrandIcon key={`${method.type}-${method.code}`} code={method.code} size={18} />)}{store.applicableMethods.length > 4 && <span className="more-methods">+{store.applicableMethods.length - 4}</span>}</span>
            <span className={`stock stock-${store.stockStatus.toLowerCase()}`}>재고 {stock[store.stockStatus]} <span>예시 데이터</span></span>
        </span><span className="store-price"><PriceTag price={store.unitPrice} small /><span>개당</span></span>
    </button>;
}
export function EmptySearch() {
    return <div className="empty-search"><div className="empty-tag-art"><div className="empty-tag"><span>개당 최저가</span><div><b>?</b><strong>원</strong></div></div><img src="/assets/empty-hole.svg" alt="" /><span className="sticker">2+1</span></div><h1>원하는 상품을 검색해 보세요.</h1><p>매대 가격표처럼 개당 최저가를 크게 보여 드려요.</p></div>;
}
export function Products({ result, busy, error, sort, changeSort, destination, choose, retry, expanded, toggle }: {
    result: QuoteResponse | null; busy: boolean; error: string; sort: Sort; changeSort: (sort: Sort) => void;
    destination: Destination | null; choose: (product: Product, store: QuoteStore) => void; retry: () => void;
    expanded: string | null; toggle: (key: string | null) => void;
}) {
    if (busy) return <Notice>상품을 검색하고 있어요…</Notice>;
    if (error) return <Notice retry={retry}>{error}</Notice>;
    if (!result) return <EmptySearch />;
    return <section aria-label="상품 검색 결과"><div className="result-summary"><span>'{result.query}' 검색 결과 <b>{result.products.length}</b></span><label><span className="sr-only">정렬</span><select value={sort} onChange={event => changeSort(event.target.value as Sort)}><option value="DISTANCE">가까운 순</option><option value="PRICE">싼 순</option></select></label></div>
        {!result.products.length ? <Notice>검색 결과가 없어요. 다른 상품을 검색해 보세요.</Notice> : result.products.map(product => <article key={product.productKey}>
            <button className="product-row" aria-expanded={expanded === product.productKey} onClick={() => toggle(expanded === product.productKey ? null : product.productKey)}>
                <ProductImage key={product.imageUrl ?? product.productKey} product={product} /><span className="product-info"><strong>{product.name}</strong><span className="product-price-meta">{product.event !== 'NONE' && <span className="event-badge">{events[product.event]}</span>}<span>정가 {won(product.listPrice)}원</span></span><span className="nearby-count">주변 {product.storeCount}개 매장</span></span>
                <span className="lowest-price"><span>개당 최저가</span><PriceTag price={product.minUnitPrice} /></span><Icon name={expanded === product.productKey ? 'up' : 'down'} size={18} />
            </button>
            {expanded === product.productKey && <div aria-label={`${product.name} 매장 목록`}>{product.stores.map(store => <StoreRow key={store.storeId} store={store} selected={destination?.storeId === store.storeId && destination.productKey === product.productKey} select={() => choose(product, store)} />)}</div>}
        </article>)}<p className="product-notice">매장마다 취급 상품이 다를 수 있음</p>
    </section>;
}

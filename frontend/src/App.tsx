import { useCallback, useEffect, useRef, useState } from 'react';
import { api, fixturesEnabled } from './api';
import { getCurrentLocation, searchDefaultCoordinates } from './location';
import { MapView } from './MapView';
import { Products } from './Products';
import { emptyWallet, readDestination, readWallet, saveDestination, saveWallet } from './storage';
import type { Coordinates, Destination, Product, QuoteResponse, QuoteStore, Sort, Wallet } from './types';
import { WalletView } from './Wallet';
import { Icon, errorMessage } from './ui';

export default function App() {
    const [tab, setTab] = useState<'products' | 'map' | 'wallet'>('products');
    const [splash, setSplash] = useState(() => { try { return sessionStorage.getItem('pyeonri.started') !== 'true'; } catch { return true; } });
    const [wallet, setWallet] = useState<Wallet>(() => { try { return readWallet(localStorage); } catch { return emptyWallet(); } });
    const [destination, setDestination] = useState<Destination | null>(() => { try { return readDestination(sessionStorage); } catch { return null; } });
    const [q, setQ] = useState(''); const [sort, setSort] = useState<Sort>('DISTANCE');
    const [result, setResult] = useState<QuoteResponse | null>(null); const [expanded, setExpanded] = useState<string | null>(null);
    const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [storageError, setStorageError] = useState('');
    const [position, setPosition] = useState<Coordinates | null>(null); const [locationError, setLocationError] = useState(''); const [locating, setLocating] = useState(false);
    const controller = useRef<AbortController | null>(null); const locationPending = useRef(false); const mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
    const locate = useCallback(() => {
        if (fixturesEnabled) return;
        if (locationPending.current) return;
        locationPending.current = true; setLocating(true); setLocationError('');
        getCurrentLocation().then(value => { if (mounted.current) setPosition(value); })
            .catch(error => { if (mounted.current) { setPosition(null); setLocationError(errorMessage(error)); } })
            .finally(() => { locationPending.current = false; if (mounted.current) setLocating(false); });
    }, []);
    useEffect(() => { if (!splash) locate(); }, [splash, locate]);
    function start() { setSplash(false); locate(); try { sessionStorage.setItem('pyeonri.started', 'true'); } catch { /* 저장 불가 상태에서도 시작 가능 */ } }
    async function search(nextSort = sort) {
        controller.current?.abort(); const current = new AbortController(); controller.current = current; setBusy(true); setError('');
        try {
            const value = await api.quotes({ q, ...(position ?? searchDefaultCoordinates), radius: 500, sort: nextSort, wallet }, current.signal);
            if (!current.signal.aborted) { setResult(value); setExpanded(null); }
        } catch (error) { if (!current.signal.aborted) setError(errorMessage(error)); }
        finally { if (!current.signal.aborted) setBusy(false); }
    }
    function choose(product: Product, store: QuoteStore) {
        const next = { storeId: store.storeId, placeName: store.placeName, x: store.x, y: store.y, brand: store.brand, productKey: product.productKey, productName: product.name, unitPrice: store.unitPrice };
        setDestination(next); try { saveDestination(sessionStorage, next); } catch { setStorageError('목적지를 새로고침 후 유지할 수 없어요. 브라우저 저장 설정을 확인해 주세요.'); }
        setTab('map'); if (!position && !locating) locate();
    }
    function updateWallet(next: Wallet) {
        try { saveWallet(localStorage, next); setWallet(next); setStorageError(''); return true; }
        catch { setStorageError('할인 수단을 저장하지 못했어요. 브라우저 저장 설정을 확인해 주세요.'); return false; }
    }
    function clearDestination() { setDestination(null); try { saveDestination(sessionStorage, null); } catch { setStorageError('저장된 목적지를 해제하지 못했어요.'); } }
    function switchTab(next: typeof tab) { setTab(next); if (next === 'map' && !position && !locating && !locationError) locate(); }
    if (splash) return <div className="app-shell splash"><button className="splash-start" onClick={start} aria-label="편리 시작하기"><div className="splash-tag"><img src="/assets/splash-hole.svg" alt="" /><span>개당 최저가</span><h1>편리</h1><p>내 주변 행사, 가장 가벼운 가격</p></div><span className="splash-sticker">2+1</span></button><p className="splash-caption">가까운 편의점, 가벼운 가격, 가장 빠른 길</p><button className="start-link" onClick={start}>시작하기 →</button></div>;
    return <div className={`app-shell ${fixturesEnabled ? 'with-fixtures' : ''}`}>
        {fixturesEnabled && <div className="fixture-banner">개발 예시 데이터 · 실제 가격·매장·경로 아님</div>}
        {storageError && <p className="storage-error" role="alert">{storageError}<button aria-label="알림 닫기" onClick={() => setStorageError('')}>×</button></p>}
        <main className={`app-content ${tab === 'map' ? 'map-content' : ''}`}>
            {tab === 'products' && <><header className="search-header"><div className="logo-row"><span className="logo">편리</span><button className="header-location" onClick={locate} disabled={locating}><Icon name="pin" size={14} />{locating ? '위치 확인 중' : position ? '내 위치 기준' : '기본 위치 기준'}</button></div><form className="search-form" onSubmit={event => { event.preventDefault(); void search(); }}><button type="submit" className="search-submit" aria-label="검색"><Icon name="search" size={20} /></button><input aria-label="상품 검색" placeholder="어떤 상품을 찾으세요?" value={q} maxLength={30} onChange={event => setQ(event.target.value)} enterKeyHint="search" /></form></header>
                {locationError && <p className="search-location-note">위치를 확인할 수 없어 기본 위치(교육장)로 검색해요.</p>}
                <Products result={result} busy={busy} error={error} sort={sort} changeSort={value => { setSort(value); void search(value); }} destination={destination} choose={choose} retry={() => void search()} expanded={expanded} toggle={setExpanded} />
            </>}
            {tab === 'map' && <MapView position={position} locationError={locationError} locating={locating} locate={locate} destination={destination} clear={clearDestination} />}
            {tab === 'wallet' && <WalletView wallet={wallet} update={updateWallet} />}
        </main>
        <nav className="bottom-nav" aria-label="주요 메뉴">{([{ id: 'products', label: '상품 목록', icon: 'list' }, { id: 'map', label: '지도', icon: 'map' }, { id: 'wallet', label: '할인 수단', icon: 'discount' }] as const).map(item => <button key={item.id} className={`${tab === item.id ? 'active' : ''} ${item.id === 'wallet' ? 'wallet-tab' : ''}`} aria-current={tab === item.id ? 'page' : undefined} onClick={() => switchTab(item.id)}><Icon name={`${item.icon}${tab === item.id ? '-active' : ''}`} /><span>{item.label}</span></button>)}</nav>
    </div>;
}

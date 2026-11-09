import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, fixturesEnabled } from './api';
import { demoCenter } from './demoLocation';
import { getCurrentLocation, searchDefaultCoordinates } from './location';
import { MapView } from './MapView';
import { Products } from './Products';
import { emptyWallet, readDestination, readWallet, saveDestination, saveWallet } from './storage';
import type { Coordinates, Destination, Product, QuoteResponse, QuoteStore, Sort, Wallet } from './types';
import { WalletView } from './Wallet';
import { Icon, errorMessage } from './ui';

type Tab = 'products' | 'map' | 'wallet';
export default function App() {
    const [tab, setTab] = useState<Tab>('products');
    const [splash, setSplash] = useState(() => { try { return sessionStorage.getItem('pyeonri.started') !== 'true'; } catch { return true; } });
    const [wallet, setWallet] = useState<Wallet>(() => { try { return readWallet(localStorage); } catch { return emptyWallet(); } });
    const [destination, setDestination] = useState<Destination | null>(() => {
        try {
            const saved = readDestination(sessionStorage);
            // 이전 데모 매장의 좌표가 새 발표 장소 지도에 복원되는 것을 방지한다. 실제 API 모드는 유지한다.
            if (fixturesEnabled && saved && ['12345678', '87654321', 'example-cafe-01'].includes(saved.storeId)) {
                saveDestination(sessionStorage, null);
                return null;
            }
            return saved;
        } catch { return null; }
    });
    const [q, setQ] = useState(''); const [sort, setSort] = useState<Sort>('DISTANCE');
    const [result, setResult] = useState<QuoteResponse | null>(null); const [expanded, setExpanded] = useState<string | null>(null);
    const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [paramError, setParamError] = useState(''); const [storageError, setStorageError] = useState('');
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
        controller.current?.abort(); const current = new AbortController(); controller.current = current; setError(''); setParamError('');
        try {
            setBusy(true);
            const value = await api.quotes({ q, ...(fixturesEnabled ? demoCenter : position ?? searchDefaultCoordinates), radius: 500, sort: nextSort, wallet }, current.signal);
            if (!current.signal.aborted) { setResult(value); setExpanded(null); }
        } catch (error) {
            if (current.signal.aborted) return;
            // 400은 검색창 아래, 그 밖의 오류는 목록 자리에 「다시 시도」와 함께
            if (error instanceof ApiError && error.status === 400) setParamError(errorMessage(error)); else setError(errorMessage(error));
        } finally { if (!current.signal.aborted) setBusy(false); }
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
    function switchTab(next: Tab) {
        setTab(next);
        if (next === 'map' && !position && !locating && !locationError) locate();
        // 목록으로 돌아오면 목적지 상품을 펼쳐 둔다(결과에 없으면 그대로)
        if (next === 'products' && destination && result?.products.some(product => product.productKey === destination.productKey)) setExpanded(destination.productKey);
    }
    if (splash) return <div className="app-shell splash"><button className="splash-start" onClick={start} aria-label="편리 시작하기"><span className="splash-logo">편리</span><span className="splash-line">내 주변 행사, 가장 가벼운 가격</span></button></div>;
    return <div className={`app-shell ${fixturesEnabled ? 'with-fixtures' : ''}`}>
        {fixturesEnabled && <div className="fixture-banner">개발 예시 데이터 · 실제 가격·매장·경로 아님</div>}
        {storageError && <p className="storage-error" role="alert">{storageError}<button aria-label="알림 닫기" onClick={() => setStorageError('')}>×</button></p>}
        <main key={tab} className={`app-content tab-fade ${tab === 'map' ? 'map-content' : ''}`}>
            {tab === 'products' && <><header className="search-header"><div className="logo-row"><span className="logo">편리</span><button className="header-location" onClick={locate} disabled={locating}><Icon name="pin" size={14} />{locating ? '위치 확인 중' : position ? '내 위치 기준' : '기본 위치 기준'}</button></div><form className="search-form" onSubmit={event => { event.preventDefault(); void search(); }}><button type="submit" className="search-submit" aria-label="검색"><Icon name="search" size={20} /></button><input aria-label="상품 검색" placeholder="어떤 상품을 찾으세요?" value={q} maxLength={30} onChange={event => setQ(event.target.value)} enterKeyHint="search" /></form>{paramError && <p className="search-error" role="alert">{paramError}</p>}</header>
                {locationError && <p className="search-location-note">위치를 확인할 수 없어 기본 위치(교육장)로 검색해요.</p>}
                <Products result={result} busy={busy} error={error} sort={sort} changeSort={value => { setSort(value); void search(value); }} destination={destination} wallet={wallet} choose={choose} retry={() => void search()} expanded={expanded} toggle={setExpanded} />
            </>}
            {tab === 'map' && <MapView position={position} locationError={locationError} locating={locating} locate={locate} destination={destination} clear={clearDestination} />}
            {tab === 'wallet' && <WalletView wallet={wallet} update={updateWallet} />}
        </main>
        <nav className="bottom-nav" aria-label="주요 메뉴">{([{ id: 'products', label: '상품 목록', icon: 'list' }, { id: 'map', label: '지도', icon: 'map' }, { id: 'wallet', label: '할인 수단', icon: 'discount' }] as const).map(item => <button key={item.id} className={tab === item.id ? 'active' : ''} aria-current={tab === item.id ? 'page' : undefined} onClick={() => switchTab(item.id)}><span className="tab-icon"><Icon name={item.icon} />{item.id === 'map' && destination && <span className="tab-dot" aria-hidden="true" />}</span><span>{item.label}</span></button>)}</nav>
    </div>;
}

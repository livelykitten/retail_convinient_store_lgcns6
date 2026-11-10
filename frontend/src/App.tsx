import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, fixturesEnabled } from './api';
import { demoCenter } from './demoLocation';
import { ArrivalView, RecordSheet, storeChoices } from './Arrival';
import type { StoreChoice } from './Arrival';
import { demoLedger, makePlan, makeReceiptEntry, methodLabel, plannedOf, readLedger, saveLedger, totalSaved } from './ledgerData';
import type { LedgerEntry, Planned, Receipt } from './ledgerData';
import { LedgerView } from './Ledger';
import { distanceM, getCurrentLocation, searchDefaultCoordinates, watchLocation } from './location';
import { MapView } from './MapView';
import { Home, Products } from './Products';
import { addRecent, emptyWallet, readDestination, readRecent, readWallet, saveDestination, saveWallet } from './storage';
import type { RecentItem } from './storage';
import type { Coordinates, Destination, Product, QuoteResponse, QuoteStore, Sort, Store, Wallet } from './types';
import { isBundleEvent } from './types';
import { WalletView } from './Wallet';
import { Icon, errorMessage, labels } from './ui';

type Tab = 'products' | 'map' | 'ledger' | 'wallet';
/** 도착 흐름(추가 화면 v3): 지도(1번) → 30m 안이면 도착 화면 자동(2번) → 「가계부에 적기」 시트(3 · 4번) */
type Arrival = 'none' | 'screen' | 'record';
const ARRIVE_M = 30;
function initialLedger(): LedgerEntry[] {
    try {
        const saved = readLedger(localStorage);
        if (saved) return saved;
        if (fixturesEnabled) { saveLedger(localStorage, demoLedger); return demoLedger; } // 발표용 예시 기록
        return [];
    } catch { return []; }
}
const walletCount = (wallet: Wallet) => (wallet.telecom ? 1 : 0) + wallet.cards.length + wallet.pays.length + wallet.memberships.length;
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
    const [recent, setRecent] = useState<RecentItem[]>(() => { try { return readRecent(localStorage); } catch { return []; } });
    const [q, setQ] = useState(''); const [sort, setSort] = useState<Sort>('DISTANCE');
    const [result, setResult] = useState<QuoteResponse | null>(null); const [expanded, setExpanded] = useState<string | null>(null);
    const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [paramError, setParamError] = useState(''); const [storageError, setStorageError] = useState('');
    const [position, setPosition] = useState<Coordinates | null>(null); const [locationError, setLocationError] = useState(''); const [locating, setLocating] = useState(false);
    const [nearbyStores, setNearbyStores] = useState<Store[]>([]); // P1 · M1에서 받은 매장, M2 다른 매장 핀용
    const [ledger, setLedger] = useState<LedgerEntry[]>(initialLedger);
    const [arrival, setArrival] = useState<Arrival>('none');
    const [dismissedStore, setDismissedStore] = useState<string | null>(null); // 닫은 도착 화면은 같은 매장에서 다시 띄우지 않는다
    const [manualRecord, setManualRecord] = useState(false); // 가계부 「영수증으로 직접 적기」
    const [cardNames, setCardNames] = useState<Record<string, string>>({});
    const controller = useRef<AbortController | null>(null); const mounted = useRef(true);
    // 진행 중인 위치 확인. 위치가 오기 전에 검색하면 이걸 기다렸다가 내 위치로 검색한다(기본 좌표로 먼 매장을 고르지 않게)
    const locationRequest = useRef<Promise<Coordinates | null> | null>(null);
    // 목적지로 걷는 동안 받는 위치(남은 거리 · 30m 도착용). 지도 · 도보 경로는 다시 그리지 않게 position과 따로 둔다
    const [livePosition, setLivePosition] = useState<Coordinates | null>(null);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
    const locate = useCallback((): Promise<Coordinates | null> => {
        if (fixturesEnabled) return Promise.resolve(null);
        if (locationRequest.current) return locationRequest.current;
        setLocating(true); setLocationError('');
        const pending = getCurrentLocation().then(value => { if (mounted.current) setPosition(value); return value; })
            .catch(error => { if (mounted.current) { setPosition(null); setLocationError(errorMessage(error)); } return null; })
            .finally(() => { locationRequest.current = null; if (mounted.current) setLocating(false); });
        locationRequest.current = pending;
        return pending;
    }, []);
    useEffect(() => { if (!splash) locate(); }, [splash, locate]);
    // P1 「내 주변 편의점」: 아직 받은 매장이 없을 때만 한 번 부른다
    const storesPoint = fixturesEnabled ? demoCenter : position;
    useEffect(() => {
        // 가계부 「영수증으로 직접 적기」의 매장 선택지도 이 목록을 쓴다
        if (splash || (tab !== 'products' && !manualRecord) || !storesPoint || nearbyStores.length) return;
        const controller = new AbortController();
        api.stores(storesPoint, controller.signal).then(value => { if (!controller.signal.aborted) setNearbyStores(value); }).catch(() => { /* 첫 화면은 목록만 숨긴다 */ });
        return () => controller.abort();
    }, [splash, tab, manualRecord, storesPoint, nearbyStores.length]);
    // 목적지로 걷는 동안 위치를 계속 받아 매장 30m 안이면 도착 화면을 연다(실제 위치 모드만)
    useEffect(() => {
        if (fixturesEnabled || splash || !destination || tab !== 'map') return;
        const stop = watchLocation(value => { if (mounted.current) setLivePosition(value); });
        return () => { stop(); setLivePosition(null); };
    }, [splash, destination, tab]);
    const walkingFrom = fixturesEnabled ? demoCenter : livePosition ?? position;
    const remainingM = walkingFrom && destination ? Math.round(distanceM(walkingFrom, destination)) : null;
    const near = !fixturesEnabled && remainingM !== null && remainingM <= ARRIVE_M;
    useEffect(() => {
        if (near && destination && dismissedStore !== destination.storeId) setArrival(value => value === 'none' ? 'screen' : value);
    }, [near, destination, dismissedStore]);
    // 카드 이름(「신한카드 Mr.Life」)은 할인 수단 선택지에 있다. 도착 흐름이 열릴 때 한 번만 받는다
    useEffect(() => {
        if ((arrival === 'none' && !manualRecord) || Object.keys(cardNames).length || !wallet.cards.some(card => card.cardId)) return;
        const controller = new AbortController();
        api.walletOptions(controller.signal).then(options => setCardNames(Object.fromEntries(options.cards.map(card => [card.cardId, card.name])))).catch(() => { /* 없으면 카드사 이름 */ });
        return () => controller.abort();
    }, [arrival, manualRecord, cardNames, wallet.cards]);
    function start() { setSplash(false); locate(); try { sessionStorage.setItem('pyeonri.started', 'true'); } catch { /* 저장 불가 상태에서도 시작 가능 */ } }
    async function search(nextSort = sort, nextWallet = wallet, query = q, preserveExpanded = false, expandKey: string | null = null) {
        controller.current?.abort(); const current = new AbortController(); controller.current = current; setError(''); setParamError('');
        try {
            setBusy(true);
            const point = fixturesEnabled ? demoCenter : position ?? (locationRequest.current ? await locationRequest.current : null) ?? searchDefaultCoordinates;
            if (current.signal.aborted) return;
            const value = await api.quotes({ q: query, ...point, radius: 500, sort: nextSort, wallet: nextWallet }, current.signal);
            if (!current.signal.aborted) {
                setResult(value);
                if (expandKey !== null) setExpanded(value.products.some(product => product.productKey === expandKey) ? expandKey : null);
                else if (!preserveExpanded) setExpanded(null);
                // 할인 수단이 바뀌어 다시 검색하면 목적지 가격도 맞춘다(데모 · 실제 공통)
                if (destination) {
                    const selected = value.products.find(product => product.productKey === destination.productKey)?.stores.find(store => store.storeId === destination.storeId);
                    if (selected && selected.unitPrice !== destination.unitPrice) {
                        const next = { ...destination, unitPrice: selected.unitPrice };
                        setDestination(next);
                        try { saveDestination(sessionStorage, next); } catch { setStorageError('목적지 가격을 저장하지 못했어요.'); }
                    }
                }
            }
        } catch (error) {
            if (current.signal.aborted) return;
            // 400은 검색창 아래, 그 밖의 오류는 목록 자리에 「다시 시도」와 함께
            if (error instanceof ApiError && error.status === 400) setParamError(errorMessage(error)); else { setError(errorMessage(error)); setResult(null); }
        } finally { if (!current.signal.aborted) setBusy(false); }
    }
    function searchFor(query: string, expandKey: string | null = null) { setQ(query); void search(sort, wallet, query, false, expandKey); }
    function backHome() { controller.current?.abort(); setBusy(false); setResult(null); setError(''); setParamError(''); setExpanded(null); setQ(''); }
    function toggle(key: string | null) {
        setExpanded(key);
        const product = key && result?.products.find(value => value.productKey === key);
        if (!product || !result) return;
        const best = product.stores[0];
        try { setRecent(list => addRecent(localStorage, list, { productKey: product.productKey, name: product.name, imageUrl: product.imageUrl, event: product.event, listPrice: product.listPrice, unitPrice: product.minUnitPrice, brand: best.brand, query: result.query })); }
        catch { /* 최근 찾은 상품은 저장 못 해도 검색에는 영향 없음 */ }
    }
    function choose(product: Product, store: QuoteStore) {
        const next = { storeId: store.storeId, placeName: store.placeName, x: store.x, y: store.y, brand: store.brand, productKey: product.productKey, productName: product.name, unitPrice: store.unitPrice,
            listPrice: product.listPrice, event: store.event, methods: store.applicableMethods };
        setArrival('none'); setDismissedStore(null);
        setDestination(next); try { saveDestination(sessionStorage, next); } catch { setStorageError('목적지를 새로고침 후 유지할 수 없어요. 브라우저 저장 설정을 확인해 주세요.'); }
        setTab('map'); if (!position && !locating) locate();
    }
    function updateWallet(next: Wallet) {
        try {
            saveWallet(localStorage, next); setWallet(next); setStorageError('');
            // 할인 수단을 바꾸면 보던 검색 결과를 새 기준으로 다시 받는다(실제 API 모드에서도. 전에는 데모만 다시 받아 가격이 예전 기준으로 남았음)
            if (result) void search(sort, next, result.query, true);
            return true;
        }
        catch { setStorageError('할인 수단을 저장하지 못했어요. 브라우저 저장 설정을 확인해 주세요.'); return false; }
    }
    function closeArrival() { setArrival('none'); if (destination) setDismissedStore(destination.storeId); }
    function record(receipt: Receipt, store: StoreChoice, planned?: Planned) {
        const entry = makeReceiptEntry(receipt, store, plan && !manualRecord ? plan : { productKey: 'receipt', productName: '영수증 기록' }, new Date(), planned);
        const next = [...ledger, entry];
        try { saveLedger(localStorage, next); } catch { setStorageError('가계부를 저장하지 못했어요. 브라우저 저장 설정을 확인해 주세요.'); return; }
        setLedger(next);
        if (manualRecord) setManualRecord(false); else { setArrival('none'); clearDestination(); }
        setTab('ledger');
    }
    function clearDestination() { setDestination(null); setArrival('none'); try { saveDestination(sessionStorage, null); } catch { setStorageError('저장된 목적지를 해제하지 못했어요.'); } }
    function switchTab(next: Tab) {
        setTab(next);
        if (next === 'map' && !position && !locating && !locationError) locate();
        // 목록으로 돌아오면 목적지 상품을 펼쳐 둔다(결과에 없으면 그대로)
        if (next === 'products' && destination && result?.products.some(product => product.productKey === destination.productKey)) setExpanded(destination.productKey);
    }
    const searching = !!result || busy || !!error;
    const destinationProduct = destination ? result?.products.find(product => product.productKey === destination.productKey) ?? null : null;
    // 도착 화면 계산값: 검색 결과에 매장이 있으면 그 값, 없으면(새로고침 등) 목적지에 저장해 둔 값
    const destinationStore = destination ? destinationProduct?.stores.find(store => store.storeId === destination.storeId) : undefined;
    const plan = destination ? makePlan({
        productKey: destination.productKey, productName: destination.productName, brand: destination.brand, storeId: destination.storeId, placeName: destination.placeName,
        event: destinationStore?.event ?? destination.event ?? 'NONE', listPrice: destinationProduct?.listPrice ?? destination.listPrice ?? destination.unitPrice,
        unitPrice: destinationStore?.unitPrice ?? destination.unitPrice, methods: destinationStore?.applicableMethods ?? destination.methods ?? []
    }, wallet, cardNames) : null;
    const saved = totalSaved(ledger);
    // 「가계부에 적기」 선택지: 등록한 통신사 · 카드
    const telecomOption = wallet.telecom ? { code: wallet.telecom.provider, label: `${labels[wallet.telecom.provider]} 멤버십` } : null;
    const cardOptions = wallet.cards.map(card => ({ code: card.cardId ?? `${card.issuer.toLowerCase()}-${card.name ?? 'direct'}`, label: card.cardId ? methodLabel('CARD', card.cardId, wallet, cardNames) : card.name ?? `${labels[card.issuer]}카드` }));
    const recordSheet = (manualRecord || (tab === 'map' && plan && arrival === 'record')) && <RecordSheet
        store={manualRecord || !plan ? null : { brand: plan.brand, storeId: plan.storeId, placeName: plan.placeName }} stores={storeChoices(nearbyStores)}
        initial={manualRecord || !plan ? { paid: null, items: [], telecom: !!telecomOption, card: cardOptions[0]?.code ?? '' } : {
            paid: plan.pay, items: isBundleEvent(plan.event) ? [{ name: plan.productName, event: plan.event, price: plan.listPrice }] : [],
            // 앱 계산값에 할인 금액이 잡힌 수단만 미리 고른다(도착 화면 「정가보다 이번에」와 같은 값이 되도록)
            telecom: plan.methods.some(method => method.kind === 'TELECOM' && method.amount > 0), card: plan.methods.find(method => method.kind === 'CARD' && method.amount > 0)?.code ?? ''
        }}
        planned={manualRecord || !plan ? undefined : plannedOf(plan)}
        telecom={telecomOption} cards={cardOptions} close={() => manualRecord ? setManualRecord(false) : setArrival('screen')} save={record} />;
    const searchForm = <form className="search-form" role="search" onSubmit={event => { event.preventDefault(); void search(); }}>
        <button type="submit" className="search-submit" aria-label="검색"><Icon name="icons/magnifying-glass" size={18} /></button>
        <input aria-label="상품 검색" placeholder="어떤 상품을 찾으세요?" value={q} maxLength={30} onChange={event => setQ(event.target.value)} enterKeyHint="search" />
        {searching && q && <button type="button" className="clear" aria-label="검색어 지우기" onClick={() => setQ('')}><Icon name="icons/x-circle-fill" size={18} /></button>}
    </form>;
    if (splash) return <div className="app-shell splash"><button className="splash-start" onClick={start} aria-label="편리 시작하기"><img className="splash-logo" src="/assets/brand/pyeonri-logo.png" alt="편리" /><span className="splash-line">내 주변 행사, 가장 가벼운 가격</span></button></div>;
    return <div className={`app-shell ${fixturesEnabled ? 'with-fixtures' : ''}`}>
        {fixturesEnabled && <div className="fixture-banner">발표용 예시 데이터 · 가격·할인율은 가상</div>}
        {storageError && <p className="storage-error" role="alert">{storageError}<button aria-label="알림 닫기" onClick={() => setStorageError('')}>×</button></p>}
        <main key={tab} className={`app-content tab-fade ${tab === 'map' ? 'map-content' : ''}`}>
            {tab === 'products' && (searching ? <>
                <header className="search-header compact"><button className="icon-button" aria-label="첫 화면으로" onClick={backHome}><Icon name="icons/caret-left" size={20} /></button>{searchForm}</header>
                {paramError && <p className="search-error" role="alert">{paramError}</p>}
                <button className="basis" onClick={() => switchTab('wallet')}><span>{walletCount(wallet) ? `내 할인 수단 ${walletCount(wallet)}개 기준` : '행사 반영 · 할인 수단 추가하기'}</span><Icon name="icons/caret-right" size={14} /></button>
                {locationError && <p className="search-location-note">위치를 확인할 수 없어 기본 위치(교육장)로 검색해요.</p>}
                <Products result={result} busy={busy} error={error} sort={sort} changeSort={value => { setSort(value); void search(value, wallet, q, true); }} destination={destination} wallet={wallet} choose={choose} retry={() => void search()} expanded={expanded} toggle={toggle} />
            </> : <>
                <header className="search-header"><div className="logo-row"><span className="logo"><img src="/assets/brand/pyeonri-logo-h.png" alt="편리" /></span><button className="header-location" onClick={() => void locate()} disabled={locating || fixturesEnabled}><Icon name="icons/map-pin" size={14} />{fixturesEnabled ? '신당동 강의장' : locating ? '위치 확인 중' : position ? '내 위치 기준' : '기본 위치 기준'}</button></div>{searchForm}{paramError && <p className="search-error" role="alert">{paramError}</p>}</header>
                <Home wallet={wallet} recent={recent} nearby={nearbyStores} saved={ledger.length ? saved : null} goLedger={() => switchTab('ledger')} search={query => searchFor(query)} openRecent={item => searchFor(item.query, item.productKey)} goWallet={() => switchTab('wallet')} goMap={() => switchTab('map')} />
            </>)}
            {tab === 'map' && (plan && (arrival === 'screen' || arrival === 'record')
                ? <ArrivalView plan={plan} saved={saved} bought={() => setArrival('record')} skip={closeArrival} />
                : <MapView position={position} locationError={locationError} locating={locating} locate={locate} destination={destination} clear={clearDestination} nearbyStores={nearbyStores} onStores={setNearbyStores} destinationProduct={destinationProduct}
                    arrive={() => setArrival('screen')} remainingM={remainingM} />)}
            {tab === 'ledger' && <LedgerView entries={ledger} findProducts={() => { backHome(); switchTab('products'); }} writeReceipt={() => setManualRecord(true)} />}
            {tab === 'wallet' && <WalletView wallet={wallet} update={updateWallet} />}
        </main>
        {recordSheet}
        <nav className="bottom-nav" aria-label="주요 메뉴">{([{ id: 'products', label: '상품 목록', icon: 'tag' }, { id: 'map', label: '지도', icon: 'map-pin' }, { id: 'ledger', label: '가계부', icon: 'receipt' }, { id: 'wallet', label: '할인 수단', icon: 'wallet' }] as const).map(item => <button key={item.id} className={tab === item.id ? 'active' : ''} aria-current={tab === item.id ? 'page' : undefined} onClick={() => switchTab(item.id)}><span className="tab-icon"><Icon name={`icons/${item.icon}${tab === item.id ? '-fill' : ''}`} size={22} />{item.id === 'map' && destination && <span className="tab-dot" aria-hidden="true" />}</span><span>{item.label}</span></button>)}</nav>
    </div>;
}

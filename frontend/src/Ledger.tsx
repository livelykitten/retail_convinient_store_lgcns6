// 추가 화면 v3 5번 「가계부」(「영수증으로 직접 적기」 포함) + v1 4번 「처음 쓸 때」
import type { LedgerEntry, SaveLine } from './ledgerData';
import { groupByDay, monthSummary, timeLabel, totalSaved } from './ledgerData';
import { BrandIcon, Icon, won } from './ui';

function LineIcon({ line }: { line: SaveLine }) {
    if (line.kind === 'EVENT') return <span className="brand-icon s event-mark" aria-hidden="true"><i /></span>;
    // 카드 ID(shinhan-mrlife)의 앞부분이 카드사 코드
    if (line.kind === 'CARD') return <BrandIcon code={line.code.split('-')[0].toUpperCase()} size="s" />;
    return <BrandIcon code={line.code} size="s" />;
}

export function LedgerView({ entries, findProducts, writeReceipt, now = new Date() }: { entries: LedgerEntry[]; findProducts: () => void; writeReceipt?: () => void; now?: Date }) {
    const receiptButton = writeReceipt && <button type="button" className="secondary receipt-button" onClick={writeReceipt}><Icon name="icons/receipt" size={16} />영수증으로 직접 적기</button>;
    const header = <header className="ledger-head"><span className="logo"><img src="/assets/brand/pyeonri-logo-h.png" alt="편리" /></span><h1>가계부</h1><p>편리로 고른 매장에서 산 기록이에요</p></header>;
    if (!entries.length) return <section className="ledger" aria-label="가계부">{header}
        <div className="ledger-empty"><Icon name="icons/receipt" size={36} /><h2>아직 기록이 없어요</h2><p>매장에 도착해 「샀어요」를 누르면<br />결제한 돈과 아낀 돈이 여기에 쌓여요</p>
            <button type="button" className="primary" onClick={findProducts}>상품 찾기</button>{receiptButton}</div>
    </section>;
    const summary = monthSummary(entries, now);
    const max = Math.max(1, ...summary.lines.map(line => line.amount));
    return <section className="ledger" aria-label="가계부">{header}
        <div className="ledger-card">
            <small>{summary.month}월에 아낀 돈</small>
            <p className="ledger-total"><b>{won(summary.saved)}</b> 원</p>
            <p className="ledger-meta"><span>구매 {summary.count}번</span><span>결제 {won(summary.paid)}원</span></p>
            <div className="ledger-row"><span>지금까지 아낀 돈</span><b>{won(totalSaved(entries))}원</b></div>
        </div>
        {receiptButton}
        {summary.lines.length > 0 && <>
            <h3 className="ledger-label">{summary.month}월, 어떻게 아꼈나</h3>
            <ul className="ledger-list">{summary.lines.map(line => <li key={`${line.kind}-${line.code}`} className="ledger-way">
                <LineIcon line={line} />
                <span className="way-name"><span>{line.label}</span><i className="bar"><i style={{ width: `${Math.max(6, Math.round(line.amount / max * 100))}%` }} /></i></span>
                <b>{won(line.amount)}원</b>
            </li>)}</ul>
        </>}
        {groupByDay(entries).map(group => <div key={group.day} className="ledger-day">
            <h3 className="ledger-label">{group.day}</h3>
            <ul className="ledger-list">{group.entries.map(entry => <li key={entry.id} className="ledger-entry">
                <BrandIcon code={entry.brand} size="s" />
                <span className="entry-name"><strong>{entry.productName}{entry.qty > 1 ? ` ${entry.qty}개` : ''}</strong><small>{entry.placeName} · {timeLabel(new Date(entry.at))}</small></span>
                <span className="entry-price"><b>{won(entry.paid)}원</b><small>{entry.saved > 0 ? `${won(entry.saved)}원 아낌` : '아낀 돈 없음'}</small></span>
            </li>)}</ul>
        </div>)}
        <p className="ledger-foot">이 기기에만 저장돼요. 가격은 수집 시점의 브랜드 가격 기준이에요.</p>
    </section>;
}

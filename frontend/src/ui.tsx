import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export const labels: Record<string, string> = {
    CU: 'CU', GS25: 'GS25', SEVEN: '세븐일레븐', EMART24: '이마트24',
    SKT: 'SKT', KT: 'KT', LGU: 'LG U+', VIP: 'VIP', NORMAL: '일반', UNKNOWN: '모름',
    KAKAOPAY: '카카오페이', NAVERPAY: '네이버페이', TOSSPAY: '토스페이', SAMSUNGWALLET: '삼성월렛',
    SHINHAN: '신한', KB: 'KB국민', SAMSUNG: '삼성', HYUNDAI: '현대', LOTTE: '롯데', WOORI: '우리', HANA: '하나', BC: 'BC', NH: 'NH농협'
};
/** public/assets/brand 에 로고가 있는 코드 */
const logoFiles: Record<string, string> = {
    CU: 'cu', GS25: 'gs25', SEVEN: 'seven', EMART24: 'emart24', SKT: 'skt', SHINHAN: 'shinhan',
    KAKAOPAY: 'kakaopay', NAVERPAY: 'naverpay', TOSSPAY: 'tosspay', SAMSUNGWALLET: 'samsungwallet'
};
export const logoUrl = (code: string) => logoFiles[code] ? `/assets/brand/${logoFiles[code]}.png` : null;
/** 로고 파일이 없을 때 쓰는 칩 글자: 이름 앞 1~2글자, 카드사를 모르면 「카드」 */
export function chipText(code: string, size: number) {
    const name = labels[code];
    if (!name) return size >= 32 ? '카드' : '카';
    return [...name.replace(/\s/g, '')].slice(0, size >= 32 ? 2 : 1).join('');
}
/** 흰 원 안의 로고. size = 'm'(38) · 's'(34) · 'xs'(26) */
export function BrandIcon({ code, size = 'm' }: { code: string; size?: 'm' | 's' | 'xs' }) {
    const url = logoUrl(code);
    return <span className={`brand-icon ${size === 'm' ? '' : size}`} title={labels[code] ?? '카드'} aria-hidden="true">
        {url ? <img src={url} alt="" /> : <span className="chip-text">{chipText(code, size === 'xs' ? 24 : 34)}</span>}
    </span>;
}
/** 로고만 작게(목록 안 매장 표시, 내 수단 줄). 파일이 없으면 글자 */
export function Logo({ code, className = 'by' }: { code: string; className?: string }) {
    const url = logoUrl(code);
    return url ? <img className={`${className} lg-${code.toLowerCase()}`} src={url} alt={labels[code] ?? ''} /> : <span className={`${className} logo-text`}>{labels[code] ?? '카드'}</span>;
}
/** SVG를 마스크로 써서 글자색(currentColor)으로 칠한다. 기준 화면 아이콘은 name="icons/…" */
export function Icon({ name, size = 22 }: { name: string; size?: number }) {
    const url = `url(/assets/${name}.svg)`;
    return <span className="icon" aria-hidden="true" style={{ width: size, height: size, maskImage: url, WebkitMaskImage: url }} />;
}
export const won = (price: number) => price.toLocaleString('ko-KR');
/** 정가 대비 할인율(%). 할인이 없으면 null */
export const discountRate = (listPrice: number, unitPrice: number) => listPrice > 0 && unitPrice < listPrice ? Math.round((1 - unitPrice / listPrice) * 100) : null;
export function Price({ price, size = 'list' }: { price: number; size?: 'list' | 'strong' | 'row' }) {
    return <span className={`price price-${size}`}><b>{won(price)}</b>원</span>;
}
/** 「50% 1,200원 개당」 줄 */
export function PriceLine({ price, listPrice, size = 'list', unit = true }: { price: number; listPrice?: number; size?: 'list' | 'strong' | 'row' | 'small'; unit?: boolean }) {
    const rate = listPrice === undefined ? null : discountRate(listPrice, price);
    return <span className={`price-line price-${size}`}>{rate !== null && <i className="pct">{rate}%</i>}<span className="price"><b>{won(price)}</b>원</span>{unit && <em>개당</em>}</span>;
}
export function Notice({ children, retry, title }: { children?: ReactNode; retry?: () => void; title?: string }) {
    return <div className="notice" role="status">{title && <h3>{title}</h3>}{children && <p>{children}</p>}{retry && <button className="secondary retry" onClick={retry}>다시 시도</button>}</div>;
}
export function Sheet({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const dialog = ref.current; dialog?.showModal();
        return () => dialog?.close();
    }, []);
    return <dialog ref={ref} className="sheet" onCancel={close} aria-labelledby="sheet-title" onClick={event => { if (event.target === event.currentTarget) close(); }}>
        <div className="sheet-inner"><div className="handle" /><div className="sheet-heading"><h2 id="sheet-title" tabIndex={-1} autoFocus>{title}</h2><button aria-label="닫기" className="icon-button" onClick={close}><Icon name="icons/x" size={20} /></button></div>{children}</div>
    </dialog>;
}
export const fallbackMessage = '잠시 뒤 다시 시도해 주세요';
export const errorMessage = (error: unknown) => error instanceof Error && error.message ? error.message : fallbackMessage;

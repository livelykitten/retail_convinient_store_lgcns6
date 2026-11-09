import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export const labels: Record<string, string> = {
    CU: 'CU', GS25: 'GS25', SEVEN: '세븐일레븐', EMART24: '이마트24',
    SKT: 'SKT', KT: 'KT', LGU: 'LG U+', VIP: 'VIP', NORMAL: '일반', UNKNOWN: '모름',
    KAKAOPAY: '카카오페이', NAVERPAY: '네이버페이', TOSSPAY: '토스페이', SAMSUNGWALLET: '삼성월렛',
    SHINHAN: '신한', KB: 'KB국민', SAMSUNG: '삼성', HYUNDAI: '현대', LOTTE: '롯데', WOORI: '우리', HANA: '하나', BC: 'BC', NH: 'NH농협'
};
const iconNames: Record<string, string> = {
    SKT: 'T', KT: 'KT', LGU: 'U+', SHINHAN: '신한', KAKAOPAY: 'pay', NAVERPAY: 'N',
    TOSSPAY: 'toss', SAMSUNGWALLET: 'W', CU: 'CU', GS25: 'GS', SEVEN: '7', EMART24: 'em'
};
export function BrandIcon({ code, size = 36 }: { code: string; size?: number }) {
    const brand = code.startsWith('shinhan-') ? 'SHINHAN' : code;
    return <span className={`brand-icon brand-${brand.toLowerCase()}`} style={{ width: size, height: size, fontSize: size * .33 }} title={labels[brand] ?? '카드'}>
        {iconNames[brand] ?? labels[brand] ?? '카드'}
    </span>;
}
export function Icon({ name, size = 22 }: { name: string; size?: number }) {
    return <span className="icon" style={{ width: size, height: size }}><img src={`/assets/${name}.svg`} alt="" /></span>;
}
export const won = (price: number) => price.toLocaleString('ko-KR');
export function PriceTag({ price, small = false }: { price: number; small?: boolean }) {
    return <span className={`price-tag ${small ? 'small' : ''}`}><img src="/assets/price-hole.svg" alt="" /><b>{won(price)}</b><span>원</span></span>;
}
export function Notice({ children, retry }: { children: ReactNode; retry?: () => void }) {
    return <div className="notice" role="status"><p>{children}</p>{retry && <button className="retry" onClick={retry}>다시 시도</button>}</div>;
}
export function Sheet({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const dialog = ref.current; dialog?.showModal();
        return () => dialog?.close();
    }, []);
    return <dialog ref={ref} className="sheet" onCancel={close} aria-labelledby="sheet-title" onClick={event => { if (event.target === event.currentTarget) close(); }}>
        <div className="sheet-inner"><div className="handle" /><div className="sheet-heading"><h2 id="sheet-title">{title}</h2><button aria-label="닫기" className="icon-button" onClick={close}><Icon name="close" /></button></div>{children}</div>
    </dialog>;
}
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : '요청을 처리하지 못했어요';

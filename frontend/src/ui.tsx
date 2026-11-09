import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export const labels: Record<string, string> = {
    CU: 'CU', GS25: 'GS25', SEVEN: '세븐일레븐', EMART24: '이마트24',
    SKT: 'SKT', KT: 'KT', LGU: 'LG U+', VIP: 'VIP', NORMAL: '일반', UNKNOWN: '모름',
    KAKAOPAY: '카카오페이', NAVERPAY: '네이버페이', TOSSPAY: '토스페이', SAMSUNGWALLET: '삼성월렛',
    SHINHAN: '신한', KB: 'KB국민', SAMSUNG: '삼성', HYUNDAI: '현대', LOTTE: '롯데', WOORI: '우리', HANA: '하나', BC: 'BC', NH: 'NH농협'
};
/** 로고 파일이 없을 때 쓰는 칩 글자: 이름 앞 1~2글자, 작은 칩은 1글자, 카드사를 모르면 「카드」 */
export function chipText(code: string, size: number) {
    const name = labels[code];
    if (!name) return size >= 32 ? '카드' : '카';
    return [...name.replace(/\s/g, '')].slice(0, size >= 32 ? 2 : 1).join('');
}
export function BrandIcon({ code, size = 36 }: { code: string; size?: number }) {
    return <span className="brand-icon" style={{ width: size, height: size, fontSize: Math.max(12, Math.round(size * .32)) }} title={labels[code] ?? '카드'} aria-hidden="true">
        {chipText(code, size)}
    </span>;
}
/** SVG를 마스크로 써서 글자색(currentColor)으로 칠한다 */
export function Icon({ name, size = 22 }: { name: string; size?: number }) {
    const url = `url(/assets/${name}.svg)`;
    return <span className="icon" aria-hidden="true" style={{ width: size, height: size, maskImage: url, WebkitMaskImage: url }} />;
}
export const won = (price: number) => price.toLocaleString('ko-KR');
export function Price({ price, size = 'list', mark = false }: { price: number; size?: 'list' | 'strong' | 'row'; mark?: boolean }) {
    return <span className={`price price-${size}`}><b className={mark ? 'mark' : undefined}>{won(price)}</b>원</span>;
}
export function Notice({ children, retry }: { children: ReactNode; retry?: () => void }) {
    return <div className="notice" role="status"><p>{children}</p>{retry && <button className="secondary retry" onClick={retry}>다시 시도</button>}</div>;
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
export const fallbackMessage = '잠시 뒤 다시 시도해 주세요';
export const errorMessage = (error: unknown) => error instanceof Error && error.message ? error.message : fallbackMessage;

import type { Destination, Wallet } from './types';

export const emptyWallet = (): Wallet => ({ telecom: null, cards: [], pays: [], memberships: [] });
const providers = ['SKT', 'KT', 'LGU'];
const grades = ['VIP', 'NORMAL', 'UNKNOWN'];
const issuers = ['SHINHAN', 'KB', 'SAMSUNG', 'HYUNDAI', 'LOTTE', 'WOORI', 'HANA', 'BC', 'NH'];
const pays = ['KAKAOPAY', 'NAVERPAY', 'TOSSPAY', 'SAMSUNGWALLET'];
const brands = ['CU', 'GS25', 'SEVEN', 'EMART24'];
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
export function isWallet(value: unknown): value is Wallet {
    if (!record(value)) return false;
    const telecom = value.telecom;
    return (telecom === null || (record(telecom) && providers.includes(String(telecom.provider)) && grades.includes(String(telecom.grade))))
        && Array.isArray(value.cards) && value.cards.every(card => record(card) && issuers.includes(String(card.issuer))
            && (typeof card.cardId === 'string' || (card.cardId === null && typeof card.name === 'string' && card.name.trim().length > 0)))
        && Array.isArray(value.pays) && value.pays.every(pay => pays.includes(pay))
        && Array.isArray(value.memberships) && value.memberships.every(brand => brands.includes(brand));
}
export function readWallet(storage: Storage): Wallet {
    try { const value: unknown = JSON.parse(storage.getItem('pyeonri.wallet') ?? 'null'); return isWallet(value) ? value : emptyWallet(); }
    catch { return emptyWallet(); }
}
export function saveWallet(storage: Storage, value: Wallet) {
    if (!isWallet(value)) throw new Error('할인 수단 입력값을 확인해 주세요');
    storage.setItem('pyeonri.wallet', JSON.stringify(value));
}
export function readDestination(storage: Storage): Destination | null {
    try {
        const value: unknown = JSON.parse(storage.getItem('pyeonri.destination') ?? 'null');
        if (!record(value) || !['storeId', 'placeName', 'productKey', 'productName'].every(key => typeof value[key] === 'string')
            || !brands.includes(String(value.brand)) || typeof value.x !== 'number' || typeof value.y !== 'number'
            || !Number.isFinite(value.x) || !Number.isFinite(value.y) || Math.abs(value.x) > 180 || Math.abs(value.y) > 90
            || typeof value.unitPrice !== 'number' || !Number.isInteger(value.unitPrice) || value.unitPrice < 0) return null;
        return value as unknown as Destination;
    } catch { return null; }
}
export function saveDestination(storage: Storage, value: Destination | null) {
    if (value) storage.setItem('pyeonri.destination', JSON.stringify(value));
    else storage.removeItem('pyeonri.destination');
}

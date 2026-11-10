export type Brand = 'CU' | 'GS25' | 'SEVEN' | 'EMART24';
export type MethodType = 'TELECOM' | 'CARD' | 'PAY' | 'MEMBERSHIP';
export type Telecom = 'SKT' | 'KT' | 'LGU';
export type TelecomGrade = 'VIP' | 'NORMAL' | 'UNKNOWN';
export type Pay = 'KAKAOPAY' | 'NAVERPAY' | 'TOSSPAY' | 'SAMSUNGWALLET';
export type CardIssuer = 'SHINHAN' | 'KB' | 'SAMSUNG' | 'HYUNDAI' | 'LOTTE' | 'WOORI' | 'HANA' | 'BC' | 'NH';
export type Event = 'NONE' | 'ONE_PLUS_ONE' | 'TWO_PLUS_ONE' | 'THREE_PLUS_ONE';
export type StockStatus = 'IN_STOCK' | 'LOW' | 'OUT';
export type Sort = 'DISTANCE' | 'PRICE';
export interface Coordinates { x: number; y: number }
export interface Card { cardId: string | null; issuer: CardIssuer; name?: string }
export interface Wallet {
    telecom: { provider: Telecom; grade: TelecomGrade } | null;
    cards: Card[];
    pays: Pay[];
    memberships: Brand[];
}
export interface WalletOptions {
    telecoms: { code: Telecom; name: string; grades: TelecomGrade[] }[];
    cards: (Card & { cardId: string; name: string })[];
    cardIssuers: { code: CardIssuer; name: string }[];
    pays: { code: Pay; name: string }[];
    memberships: { brand: Brand; name: string }[];
}
export interface Store extends Coordinates {
    storeId: string; brand: Brand; placeName: string; distanceM: number; walkMin: number;
}
export interface QuoteStore extends Store {
    event: Event; eventLabel: string; unitPrice: number;
    applicableMethods: { type: MethodType; code: string }[];
    stockStatus: StockStatus;
}
export interface Product {
    productKey: string; name: string; imageUrl: string | null; event: Event;
    listPrice: number; minUnitPrice: number; storeCount: number; stores: QuoteStore[];
}
export interface QuoteRequest extends Coordinates {
    q: string; radius?: number; sort?: Sort; wallet?: Wallet;
}
export interface QuoteResponse { query: string; products: Product[] }
export interface WalkingRoute {
    distanceM: number; durationSeconds: number; path: Coordinates[]; landingUrl: string | null;
}
export interface Destination extends Coordinates {
    storeId: string; placeName: string; productKey: string; unitPrice: number;
    productName: string; brand: Brand;
    /** 도착 화면 계산용(고른 시점 값). 예전에 저장된 목적지에는 없을 수 있다 */
    listPrice?: number; event?: Event; methods?: { type: MethodType; code: string }[];
}

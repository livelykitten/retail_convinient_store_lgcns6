import type { Coordinates, QuoteRequest, QuoteResponse, Store, WalkingRoute, WalletOptions } from './types';

export class ApiError extends Error {
    constructor(public code: string, message: string, public status = 0) { super(message); }
}
export const fixturesEnabled = import.meta.env.DEV && import.meta.env.VITE_USE_FIXTURES === 'true';
const messages: Record<string, string> = {
    INVALID_PARAM: '입력값을 확인해 주세요',
    KAKAO_RATE_LIMIT: '잠시 뒤 다시 시도해 주세요',
    KAKAO_ERROR: '매장 정보 또는 도보 경로를 불러오지 못했어요',
    ROUTE_NOT_FOUND: '도보 경로를 찾지 못했어요'
};
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
    let response: Response;
    try {
        response = await fetch(`${base}${path}`, {
            ...init, headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
            signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000)
        });
    } catch (error) {
        if (init.signal?.aborted) throw error;
        throw new Error('서버에 연결하지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.');
    }
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new ApiError(error.code ?? '', messages[error.code] ?? error.message ?? '요청을 처리하지 못했어요', response.status);
    }
    return response.json() as Promise<T>;
}
export function validateCoordinates(point: Coordinates) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || Math.abs(point.x) > 180 || Math.abs(point.y) > 90) {
        throw new ApiError('INVALID_PARAM', '좌표를 확인해 주세요', 400);
    }
}
export const api = {
    async walletOptions(signal?: AbortSignal): Promise<WalletOptions> {
        if (fixturesEnabled) return (await import('./fixtures')).walletOptions;
        return request('/api/wallet-options', { signal });
    },
    async quotes(input: QuoteRequest, signal?: AbortSignal): Promise<QuoteResponse> {
        validateCoordinates(input);
        if (!input.q.trim() || input.q.trim().length > 30 || (input.radius !== undefined && (input.radius <= 0 || input.radius > 2000))) {
            throw new ApiError('INVALID_PARAM', '검색어는 1~30자, 반경은 1~2000m로 입력해 주세요', 400);
        }
        const body = { ...input, q: input.q.trim() };
        if (fixturesEnabled) return (await import('./fixtures')).quotes(body);
        return request('/api/quotes', { method: 'POST', body: JSON.stringify(body), signal });
    },
    async stores(point: Coordinates, signal?: AbortSignal): Promise<Store[]> {
        validateCoordinates(point);
        if (fixturesEnabled) return (await import('./fixtures')).stores;
        return request(`/api/stores?${new URLSearchParams({ x: String(point.x), y: String(point.y), radius: '500' })}`, { signal });
    },
    async walking(start: Coordinates, end: Coordinates, signal?: AbortSignal): Promise<WalkingRoute> {
        validateCoordinates(start); validateCoordinates(end);
        // 개발 예시를 실제 보행 경로로 오인하지 않도록 fixture에서는 경로 성공을 만들지 않는다.
        if (fixturesEnabled) throw new ApiError('ROUTE_NOT_FOUND', '개발 예시 모드에서는 실제 도보 경로를 제공하지 않아요', 404);
        return request(`/api/routes/walking?${new URLSearchParams({ startX: String(start.x), startY: String(start.y), endX: String(end.x), endY: String(end.y) })}`, { signal });
    }
};

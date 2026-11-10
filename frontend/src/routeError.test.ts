import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { routeErrorMessage } from './MapView';

describe('M2 경로 실패 문구 (실제 API 모드)', () => {
    it.each([
        [404, 'ROUTE_NOT_FOUND', '도보 경로를 찾지 못했어요'],
        [429, 'KAKAO_RATE_LIMIT', '잠시 뒤 다시 시도해 주세요'],
        [502, 'KAKAO_ERROR', '도보 경로를 불러오지 못했어요'],
        [500, 'INTERNAL', '서버 문구']
    ])('%i', (status, code, text) => expect(routeErrorMessage(new ApiError(code, '서버 문구', status))).toBe(text));
    it('코드 이름이 바뀌어도 상태 코드로 나눈다', () => expect(routeErrorMessage(new ApiError('ROUTE_ERROR', 'x', 502))).toBe('도보 경로를 불러오지 못했어요'));
});

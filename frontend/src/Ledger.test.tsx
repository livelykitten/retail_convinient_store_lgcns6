// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { api, ApiError } from './api';
import { quotes, stores, walletOptions } from './fixtures';
import { loadKakao } from './kakao';

vi.mock('./kakao', async importOriginal => ({ ...await importOriginal<typeof import('./kakao')>(), loadKakao: vi.fn() }));
beforeEach(() => {
    localStorage.clear(); sessionStorage.clear(); sessionStorage.setItem('pyeonri.started', 'true');
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function(this: HTMLDialogElement) { this.open = true; } });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function(this: HTMLDialogElement) { this.open = false; } });
    vi.spyOn(api, 'walletOptions').mockResolvedValue(walletOptions);
    vi.spyOn(api, 'quotes').mockImplementation(async input => quotes(input));
    vi.spyOn(api, 'stores').mockResolvedValue(stores);
    vi.spyOn(api, 'walking').mockRejectedValue(new ApiError('ROUTE_NOT_FOUND', '도보 경로를 찾지 못했어요', 404));
    vi.mocked(loadKakao).mockRejectedValue(new Error('지도 설정이 필요해요'));
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: vi.fn((_success, failure) => failure({ code: 1 })) } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('추가 화면 v3 · 도착 → 가계부', () => {
    it('하단 탭 4칸, 처음엔 가계부가 비어 있다', async () => {
        const user = userEvent.setup(); render(<App />);
        const nav = screen.getByRole('navigation', { name: '주요 메뉴' });
        expect(within(nav).getAllByRole('button').map(button => button.textContent)).toEqual(['상품 목록', '지도', '가계부', '할인 수단']);
        await user.click(within(nav).getByRole('button', { name: '가계부' }));
        expect(screen.getByText('아직 기록이 없어요')).toBeTruthy();
        expect(screen.queryByText('지금까지 아낀 돈')).toBeNull();
    });
    it('목적지 → 도착했어요 → 샀어요 → 가계부에 적기 → 가계부 · 첫 화면 「지금까지 아낀 돈」', async () => {
        const user = userEvent.setup(); render(<App />);
        await user.type(screen.getByRole('textbox', { name: '상품 검색' }), '우유');
        await user.click(screen.getByRole('button', { name: '검색' }));
        await user.click(await screen.findByRole('button', { name: /빙그레 바나나맛우유/ }));
        await user.click(screen.getByRole('button', { name: '길찾기' })); // GS25 2+1, 개당 1,000원 · 정가 1,500원
        await user.click(await screen.findByRole('button', { name: '도착했어요' }));
        expect(screen.getByRole('heading', { name: 'GS25 신당퍼스트점' })).toBeTruthy();
        expect(screen.getByText(/3개를 챙기세요/)).toBeTruthy();
        await user.click(screen.getByRole('button', { name: '샀어요' }));
        // 앱 계산값으로 미리 채움: 낸 돈 3,000원 + 2+1 상품
        expect((screen.getByRole('textbox', { name: '낸 돈 합계' }) as HTMLInputElement).value).toBe('3,000');
        expect((screen.getByRole('textbox', { name: '행사 상품 1 이름' }) as HTMLInputElement).value).toBe('빙그레 바나나맛우유 240ml');
        expect(screen.getByText('1,500원', { selector: 'strong' })).toBeTruthy();
        await user.click(screen.getByRole('button', { name: '가계부에 적기' }));
        expect(await screen.findByText('빙그레 바나나맛우유 240ml 3개')).toBeTruthy();
        expect(screen.getByText('1,500원 아낌')).toBeTruthy();
        expect(sessionStorage.getItem('pyeonri.destination')).toBeNull();
        await user.click(screen.getByRole('button', { name: '상품 목록' }));
        await user.click(screen.getByRole('button', { name: '첫 화면으로' }));
        await user.click(screen.getByRole('button', { name: /지금까지 아낀 돈/ }));
        expect(screen.getByRole('heading', { name: '가계부' })).toBeTruthy();
    });
    it('SKT 등록 · CU 바나나맛우유 2+1: 행사 상품에도 통신사 할인이 붙은 가격이라도 그대로 적힌다', async () => {
        localStorage.setItem('pyeonri.wallet', JSON.stringify({ telecom: { provider: 'SKT', grade: 'VIP' }, cards: [], pays: [], memberships: [] }));
        const user = userEvent.setup(); render(<App />);
        await user.type(screen.getByRole('textbox', { name: '상품 검색' }), '우유');
        await user.click(screen.getByRole('button', { name: '검색' }));
        await user.click(await screen.findByRole('button', { name: /빙그레 바나나맛우유/ }));
        await user.click(screen.getByRole('button', { name: '길찾기' })); // SKT 기준 최저가 = CU
        await user.click(await screen.findByRole('button', { name: '도착했어요' }));
        expect(screen.getByRole('heading', { name: 'CU 신당다산로점' })).toBeTruthy();
        await user.click(screen.getByRole('button', { name: '샀어요' }));
        expect(screen.queryByRole('alert')).toBeNull();
        expect(screen.getByText('1,800원', { selector: 'strong' })).toBeTruthy();
        await user.click(screen.getByRole('button', { name: '가계부에 적기' }));
        expect(await screen.findByText('1,800원 아낌')).toBeTruthy();
    });
    it('영수증으로 직접 적기: 매장을 고르고 낸 돈 · 행사 상품으로 기록', async () => {
        const user = userEvent.setup(); render(<App />);
        await user.click(screen.getByRole('button', { name: '가계부' }));
        await user.click(screen.getByRole('button', { name: '영수증으로 직접 적기' }));
        expect(screen.getByRole('button', { name: '가계부에 적기' }).hasAttribute('disabled')).toBe(true);
        await user.type(screen.getByRole('textbox', { name: '낸 돈 합계' }), '1890');
        await user.click(screen.getByRole('button', { name: '행사 상품 추가' }));
        await user.type(screen.getByRole('textbox', { name: '행사 상품 1 이름' }), '펩시제로라임캔355ml');
        await user.type(screen.getByRole('textbox', { name: '행사 상품 1 정가' }), '1890');
        await user.click(screen.getByRole('button', { name: '가계부에 적기' }));
        expect(await screen.findByText('펩시제로라임캔355ml 2개')).toBeTruthy();
        expect(screen.getByText('1,890원 아낌')).toBeTruthy();
    });
    it('금액 칸: 쉼표 바로 뒤에서 지우면 앞 숫자가 지워지고 커서는 그 자리에 남는다', async () => {
        const user = userEvent.setup(); render(<App />);
        await user.click(screen.getByRole('button', { name: '가계부' }));
        await user.click(screen.getByRole('button', { name: '영수증으로 직접 적기' }));
        const paid = screen.getByRole('textbox', { name: '낸 돈 합계' }) as HTMLInputElement;
        await user.type(paid, '30000');
        expect(paid.value).toBe('30,000');
        await user.type(paid, '{Backspace}', { initialSelectionStart: 3, initialSelectionEnd: 3 });
        expect(paid.value).toBe('3,000');
        expect(paid.selectionStart).toBe(1);
        await user.type(paid, '5', { initialSelectionStart: 1, initialSelectionEnd: 1 });
        expect(paid.value).toBe('35,000');
        expect(paid.selectionStart).toBe(2);
    });
    it('낸 돈이 행사 상품 값보다 적거나 행사 상품 정가가 비면 적을 수 없다', async () => {
        const user = userEvent.setup(); render(<App />);
        await user.click(screen.getByRole('button', { name: '가계부' }));
        await user.click(screen.getByRole('button', { name: '영수증으로 직접 적기' }));
        await user.type(screen.getByRole('textbox', { name: '낸 돈 합계' }), '1000');
        await user.click(screen.getByRole('button', { name: '행사 상품 추가' }));
        await user.type(screen.getByRole('textbox', { name: '행사 상품 1 이름' }), '코카콜라캔350ml');
        expect(screen.getByRole('alert').textContent).toContain('이름과 정가를 모두');
        await user.type(screen.getByRole('textbox', { name: '행사 상품 1 정가' }), '2200');
        expect(screen.getByRole('alert').textContent).toContain('행사 상품 값(2,200원)보다 적어요');
        expect(screen.getByRole('button', { name: '가계부에 적기' }).hasAttribute('disabled')).toBe(true);
    });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DragRow } from './Products';

afterEach(cleanup);
/** jsdom에는 PointerEvent가 없어 MouseEvent에 pointerType · pointerId를 붙여 보낸다 */
function pointer(target: Element, type: string, clientX: number, pointerType = 'mouse') {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, button: 0 });
    Object.defineProperties(event, { pointerType: { value: pointerType }, pointerId: { value: 1 } });
    target.dispatchEvent(event);
}
describe('최근 찾은 상품 · 마우스로 끌어서 넘기기', () => {
    it('마우스로 끌면 옆으로 넘어가고, 끈 뒤의 클릭은 카드를 열지 않는다', () => {
        const open = vi.fn();
        render(<DragRow className="recent-row"><button onClick={open}>카드</button></DragRow>);
        const card = screen.getByRole('button', { name: '카드' }); const row = card.parentElement!;
        row.scrollLeft = 100;
        pointer(card, 'pointerdown', 300); pointer(card, 'pointermove', 220); pointer(card, 'pointerup', 220);
        expect(row.scrollLeft).toBe(180);
        card.click(); expect(open).not.toHaveBeenCalled();
        card.click(); expect(open).toHaveBeenCalledTimes(1); // 다음 클릭은 그대로
    });
    it('조금(5px 미만)만 움직인 클릭은 그대로 카드를 연다, 터치는 브라우저 기본 스크롤', () => {
        const open = vi.fn();
        render(<DragRow className="recent-row"><button onClick={open}>카드</button></DragRow>);
        const card = screen.getByRole('button', { name: '카드' }); const row = card.parentElement!;
        pointer(card, 'pointerdown', 300); pointer(card, 'pointermove', 297); pointer(card, 'pointerup', 297); card.click();
        expect(open).toHaveBeenCalledTimes(1);
        row.scrollLeft = 50; pointer(card, 'pointerdown', 300, 'touch'); pointer(card, 'pointermove', 200, 'touch');
        expect(row.scrollLeft).toBe(50);
    });
});

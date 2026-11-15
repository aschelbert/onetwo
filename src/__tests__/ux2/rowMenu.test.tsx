/**
 * The row ··· menu is drawn on the page body, fixed beside its button, so a
 * table's scroll box (overflow hidden) doesn't cut off the last row's menu,
 * and it opens upward when there isn't room below the button.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RowMenu, Table } from '@/ux2/components/Table';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const renderMenu = (onEdit = vi.fn()) => {
  render(<Table><tbody><tr><td><RowMenu label="More for unit 4" items={[{ label: 'Edit', onSelect: onEdit }, { label: 'Remove', onSelect: vi.fn(), danger: true }]} /></td></tr></tbody></Table>);
  return onEdit;
};
const at = (top: number) => vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top, bottom: top + 44, left: 900, right: 944, width: 44, height: 44, x: 900, y: top, toJSON: () => ({}) } as DOMRect);

describe('RowMenu', () => {
  it('opens outside the table\'s scroll box, below its button when there is room', () => {
    at(100);
    const onEdit = renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'More for unit 4' }));
    const menu = screen.getByRole('menu');
    expect(menu.closest('.overflow-x-auto')).toBeNull();
    expect(menu.parentElement).toBe(document.body);
    expect(menu.dataset.placement).toBe('down');
    expect(menu.style.position).toBe('fixed');
    expect(menu.style.top).toBe('148px');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens upward on a row near the bottom of the window, and closes on Escape or a scroll', () => {
    at(window.innerHeight - 50);
    renderMenu();
    const button = screen.getByRole('button', { name: 'More for unit 4' });
    fireEvent.click(button);
    expect(screen.getByRole('menu').dataset.placement).toBe('up');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(button);
    fireEvent.scroll(window);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

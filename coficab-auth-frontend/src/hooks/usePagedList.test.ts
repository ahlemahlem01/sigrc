import { act, renderHook } from '@testing-library/react';
import { usePagedList } from './usePagedList';

const numbers = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('usePagedList', () => {
  it('returns the rows of the current page', () => {
    const { result } = renderHook(() => usePagedList(numbers(60), 25));
    expect(result.current.rows).toHaveLength(25);
    expect(result.current.pages).toBe(3);

    act(() => result.current.setPage(3));
    expect(result.current.rows).toEqual(numbers(60).slice(50));
    expect(result.current.page).toBe(3);
  });

  it('goes back to the first page when the list changes (a filter)', () => {
    const { result, rerender } = renderHook(({ list }) => usePagedList(list, 10), { initialProps: { list: numbers(50) } });
    act(() => result.current.setPage(4));
    expect(result.current.page).toBe(4);

    rerender({ list: numbers(12) });
    expect(result.current.page).toBe(1);
    expect(result.current.rows).toHaveLength(10);
  });

  it('copes with an empty list', () => {
    const { result } = renderHook(() => usePagedList([], 25));
    expect(result.current.rows).toEqual([]);
    expect(result.current.pages).toBe(1);
    expect(result.current.page).toBe(1);
  });
});

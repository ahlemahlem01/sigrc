import { act, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import ScrollToTop from './ScrollToTop';

describe('ScrollToTop', () => {
  beforeEach(() => {
    window.scrollTo = jest.fn();
    // jsdom has no scroll restoration: give it the browser property so the component can set it.
    Object.defineProperty(window.history, 'scrollRestoration', { value: 'auto', writable: true, configurable: true });
  });

  it('scrolls to the top when the page first opens and the browser stops restoring offsets', () => {
    render(<MemoryRouter initialEntries={['/a']}><ScrollToTop /></MemoryRouter>);

    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
    expect(window.history.scrollRestoration).toBe('manual');
  });

  it('scrolls to the top on every change of page, but not when only the query string changes', () => {
    render(
      <MemoryRouter initialEntries={['/a']}>
        <ScrollToTop />
        <Link to="/b">to b</Link>
        <Link to="/b?tab=capa">tab</Link>
        <Routes><Route path="*" element={null} /></Routes>
      </MemoryRouter>,
    );
    (window.scrollTo as jest.Mock).mockClear();

    act(() => { screen.getByText('to b').click(); });
    expect(window.scrollTo).toHaveBeenCalledTimes(1);

    act(() => { screen.getByText('tab').click(); }); // same path, other tab: the reader keeps their place
    expect(window.scrollTo).toHaveBeenCalledTimes(1);
  });
});

import { useEffect, useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

/** Every page opens at its top, on navigation and on refresh (the browser would otherwise restore the previous scroll offset). */
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
  }, []);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

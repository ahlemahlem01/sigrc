import { useEffect, useLayoutEffect, useRef } from 'react';

/**
 * The sidebar collapses on mouse leave and its submenus are hidden while collapsed, so the browser resets its scroll to the
 * top. This keeps the position: it is remembered while the sidebar is open and restored when it opens again; when there is
 * nothing to restore (first opening, or the page changed meanwhile) the selected submenu is brought into view.
 */
export function useSidebarScroll(expanded: boolean, pathname: string) {
  const ref = useRef<HTMLDivElement>(null);
  const saved = useRef(0);

  // remember the position while the user scrolls the open sidebar
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onScroll = () => {
      if (el.classList.contains('expanded')) saved.current = el.scrollTop;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !expanded) return;
    if (saved.current > 0) {
      el.scrollTop = saved.current;
      return;
    }
    el.querySelector<HTMLElement>('.al-sidebar-sublink.active')?.scrollIntoView({ block: 'center' });
  }, [expanded, pathname]);

  return ref;
}

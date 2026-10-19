import { useEffect, useMemo, useState } from 'react';

/**
 * Client-side paging of a list already in memory: the rows of the current page, and the setter the shared
 * TablePagination expects. Goes back to page 1 when the list changes (a filter, a search) and never stays on a page
 * that no longer exists.
 */
export function usePagedList<T>(items: readonly T[], pageSize = 25) {
  const [page, setPage] = useState(1);
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  // a different list (filter, search, refresh with another size) starts from the top
  useEffect(() => { setPage(1); }, [total, pageSize]);

  const current = Math.min(page, pages);
  const rows = useMemo(() => items.slice((current - 1) * pageSize, current * pageSize), [items, current, pageSize]);
  return { rows, page: current, pageSize, total, pages, setPage };
}

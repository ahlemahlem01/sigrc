/**
 * The organizations the superadmin follows, readable outside React: the list services add them to their requests so
 * every page that lists claims or plans follows the top-bar selector without each call site passing it along.
 */
let current: string | undefined;

export function setScopeParam(value: string | undefined) {
  current = value;
}

/** "id1,id2" or undefined (every organization). */
export function getScopeParam(): string | undefined {
  return current;
}

/** Query parameters to merge into a list request. */
export function scopeParams(): { organizationIds?: string } {
  return current ? { organizationIds: current } : {};
}

/** The URL with the followed organizations added to its query string. */
export function withScope(url: string): string {
  return current ? `${url}${url.includes('?') ? '&' : '?'}organizationIds=${current}` : url;
}

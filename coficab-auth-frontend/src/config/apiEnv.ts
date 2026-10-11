const trim = (value: string) => value.replace(/\/$/, '');

/** Auth API origin, without a trailing slash. */
export const AUTH_API_URL = trim(process.env.REACT_APP_AUTH_API_URL || 'https://localhost:7102');

/** Action Plan API base, including `/api`. */
export const ACTION_PLAN_API_URL = trim(
  process.env.REACT_APP_ACTION_PLAN_API_URL || 'https://localhost:7204/api',
);

/** Action Plan host, without `/api` (static files and SignalR). */
export const ACTION_PLAN_ORIGIN = ACTION_PLAN_API_URL.replace(/\/api$/, '');

/** ML recommendation service origin, without a trailing slash. */
export const ML_API_URL = trim(process.env.REACT_APP_ML_API_URL || 'http://localhost:8001');

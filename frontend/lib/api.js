// Fetch wrapper for /api/v1. Parses the shared error envelope
// {code, message, fieldErrors, correlationId} into ApiError so forms can show
// each field's message next to the field. Only the session token is kept in
// sessionStorage (cleared when the tab closes); operational data always comes
// from the API.
const KEY = 'hearth.session';
let token = sessionStorage.getItem(KEY) || '';
let onUnauthorized = null;

export class ApiError extends Error {
  constructor(status, body = {}) {
    super(body.message || (status ? `Request failed (${status})` : 'Network error'));
    this.status = status;
    this.code = body.code || 'ERROR';
    this.fieldErrors = body.fieldErrors || [];
    this.correlationId = body.correlationId;
    this.body = body;
  }
  field(name) { return this.fieldErrors.find(f => f.field === name)?.message; }
}

export const setToken = value => { token = value || ''; value ? sessionStorage.setItem(KEY, value) : sessionStorage.removeItem(KEY); };
export const getToken = () => token;
export const setUnauthorizedHandler = fn => { onUnauthorized = fn; };
export const newId = () => crypto.randomUUID();

export async function api(path, { method = 'GET', body, query, key } = {}) {
  const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')) : '';
  let response;
  try {
    response = await fetch(`/api/v1${path}${qs === '?' ? '' : qs}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-Id': `ui-${newId().slice(0, 12)}`,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(key ? { 'Idempotency-Key': key } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, { code: 'NETWORK', message: "Can't reach the server. Check that the API is running, then retry." });
  }
  let data = {};
  try { data = await response.json(); } catch { /* empty or non-JSON body */ }
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login') onUnauthorized?.();
    throw new ApiError(response.status, data);
  }
  return data;
}

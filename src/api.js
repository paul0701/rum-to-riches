// Thin client for the Netlify Functions API. The browser never touches Blobs directly.
const SESSION_KEY = "rtr:session";
const cacheKey = (id) => `rtr:cache:${id}`;

export const session = {
  get() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
  },
  set(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); },
  clear() { localStorage.removeItem(SESSION_KEY); }
};

// Offline cache only: the server copy in Netlify Blobs is always the source of truth.
export const cache = {
  get(id) {
    try { return JSON.parse(localStorage.getItem(cacheKey(id))); } catch { return null; }
  },
  set(id, data) {
    try { localStorage.setItem(cacheKey(id), JSON.stringify({ ...data, cachedAt: Date.now() })); } catch { /* quota */ }
  }
};

export class ApiError extends Error {
  constructor(message, status, data = {}) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function api(path, body) {
  const s = session.get();
  const headers = { "Content-Type": "application/json" };
  if (s?.token) headers.Authorization = `Bearer ${s.token}`;
  let res;
  try {
    res = await fetch(path, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError("Cannot reach the harbour. Check your connection.", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status}).`, res.status, data);
  return data;
}

export const Api = {
  auth: (body) => api("/api/auth", body),
  load: () => api("/api/load"),
  save: (body) => api("/api/save", body),
  voyages: (body) => api("/api/voyages", body)
};

/** Browser transport: only the caller's configured application origin and API prefix. */
export function createSameOriginFetch(origin, fetchImpl = globalThis.fetch) {
  const base = new URL(origin);
  if (!['http:', 'https:'].includes(base.protocol) || base.origin !== origin) {
    throw new TypeError('Expected an exact application origin');
  }
  return async function apiFetch(request) {
    const url = new URL(request.url);
    if (url.origin !== base.origin || !url.pathname.startsWith('/api/v1/') || url.username || url.password || url.hash) {
      throw new TypeError('API request outside application boundary');
    }
    // Browser manages the standard session cookie and Origin. No replay or RPC fallback.
    return fetchImpl(new Request(request, { credentials: 'same-origin', redirect: 'error', cache: 'no-store' }));
  };
}

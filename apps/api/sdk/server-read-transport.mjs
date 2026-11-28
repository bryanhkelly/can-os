/** Request-scoped server rendering transport. No cookies are taken from SDK inputs. */
const sessionNames = new Set(['__Host-can_os_session', '__Host-can_os_v3_session']);

export function createServerReadFetch(origin, incomingRequest, fetchImpl = globalThis.fetch) {
  const base = new URL(origin);
  if (base.protocol !== 'https:' || base.origin !== origin || new URL(incomingRequest.url).origin !== origin)
    throw new TypeError('Expected trusted HTTPS application origin');
  const selected = new Map();
  for (const part of (incomingRequest.headers.get('cookie') ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (!sessionNames.has(name)) continue;
    const value = part.slice(separator + 1).trim();
    if (selected.has(name) || !/^[A-Za-z0-9_-]{40,128}$/.test(value))
      throw new TypeError('Invalid session cookie');
    selected.set(name, value);
  }
  const cookie = [...selected].map(([name, value]) => name + '=' + value).join('; ');
  return async function serverRead(request) {
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== origin || !url.pathname.startsWith('/api/v1/') || url.username || url.password || url.hash)
      throw new TypeError('Request outside server read boundary');
    const headers = new Headers({ accept: 'application/json' });
    if (cookie) headers.set('cookie', cookie);
    // Never forward incoming authorization, arbitrary proxy headers, or SDK cookies.
    // A read cannot mint, switch or revoke credentials. No redirects or retries.
    return fetchImpl(new Request(url, { method: 'GET', headers, signal: request.signal,
      cache: 'no-store', redirect: 'error', credentials: 'omit' }));
  };
}

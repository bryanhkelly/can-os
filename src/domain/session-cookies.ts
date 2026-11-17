import { AuthorizationError } from "./command-context";

/** Read a single cookie without treating name prefixes as matches. */
export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  let found: string | undefined;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      // Duplicate session names are ambiguous, never choose one silently.
      if (found !== undefined) throw new AuthorizationError("unambiguous session cookie");
      found = part.slice(separator + 1).trim();
    }
  }
  return found;
}

/** The same reviewed attributes are used for every privileged session. */
export function secureSessionCookieHeader(name: string, token: string, maxAgeSeconds: number): string {
  if (!/^__Host-[A-Za-z0-9_-]+$/.test(name) || !/^[A-Za-z0-9_-]{40,}$/.test(token) ||
      !Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds < 0) {
    throw new Error("Invalid privileged session cookie");
  }
  return `${name}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

import { normalizeFacilitatedPairingCode } from "./facilitated-learning";

/** The QR code uses an origin-only URL fragment. Fragments are not included
 * in HTTP requests, server logs or Referrer headers. The join screen reads it
 * once, clears it from browser history, then uses the existing scoped pairing
 * API. The code itself NEVER grants identity, enrollment or attendance.
 */
export function classroomQrJoinUrl(origin: string, code: string): string {
  const normalized = normalizeFacilitatedPairingCode(code);
  const url = new URL("/join", origin);
  url.hash = "pair=" + normalized;
  return url.toString();
}

export function displayClassroomCode(code: string): string {
  const normalized = normalizeFacilitatedPairingCode(code);
  return normalized.slice(0, 5) + "-" + normalized.slice(5);
}

export function classroomCodeFromFragment(hash: string): string | null {
  if (!hash.startsWith("#pair=")) return null;
  try {
    return normalizeFacilitatedPairingCode(hash.slice(6));
  } catch { return null; }
}

/**
 * URL representation for canonical UUIDs. A 128-bit UUID becomes 22
 * unpadded base64url characters, without a database migration.
 *
 * This is an encoding, NOT encryption, redaction, authorization or a share
 * token. Existing UUID path segments remain accepted for old bookmarks.
 */
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tokenPattern = /^[A-Za-z0-9_-]{22}$/;
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const reverse = new Map([...alphabet].map((char, index) => [char, index]));

function fromHex(hex: string): number[] {
  return Array.from({ length: 16 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16));
}

/** Always emits canonical 22-character URL-safe encoding. */
export function encodeUuidForPath(value: string): string {
  if (!uuidPattern.test(value)) throw new Error("Expected canonical UUID");
  const bytes = fromHex(value.replace(/-/g, "").toLowerCase());
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      out += alphabet[(buffer >>> bits) & 63];
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits) out += alphabet[(buffer << (6 - bits)) & 63];
  return out;
}

/** Backward-compatible, strict decoder. Malformed non-canonical tokens fail closed. */
export function decodeUuidPathParam(value: string): string | null {
  if (uuidPattern.test(value)) return value.toLowerCase();
  if (!tokenPattern.test(value)) return null;
  let buffer = 0;
  let bits = 0;
  const bytes: number[] = [];
  for (const char of value) {
    const six = reverse.get(char);
    if (six === undefined) return null;
    buffer = (buffer << 6) | six;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 255);
      buffer &= (1 << bits) - 1;
    }
  }
  if (bytes.length !== 16 || buffer !== 0) return null;
  const hex = bytes.map(byte => byte.toString(16).padStart(2, "0")).join("");
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return encodeUuidForPath(uuid) === value ? uuid : null;
}

/** TanStack Router turns internal UUID params into short links automatically. */
export function opaqueUuidPathParam<K extends string>(key: K) {
  return {
    parse: (params: Record<K, string>): Record<K, string> | false => {
      const uuid = decodeUuidPathParam(params[key]);
      return uuid ? { ...params, [key]: uuid } : false;
    },
    stringify: (params: Record<K, string>): Record<K, string> => ({
      ...params,
      [key]: encodeUuidForPath(params[key]),
    }),
  };
}

/** For domain link strings: compact UUIDs, preserve legacy escaping for other
 * values until their owning route validates or rejects the reference. */
export function shortUuidHref(prefix: string, reference: string): string {
  const uuid = decodeUuidPathParam(reference);
  return prefix + (uuid ? encodeUuidForPath(uuid) : encodeURIComponent(reference));
}

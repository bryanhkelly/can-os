import { decodeUuidPathParam } from "./opaque-url-id";

export type LinkedGoTargetKind = "class" | "adult-training" | "enrichment";

/** Normalize an exact internal navigation target into its canonical UUID.
 * Never accept an arbitrary URL for redirection: /go owns the destination.
 * Full URLs are accepted ONLY from the current application origin.
 */
export function resolveGoTargetInput(
  kind: LinkedGoTargetKind, raw: string, applicationOrigin?: string,
): string | null {
  const input = raw.trim();
  const directId = decodeUuidPathParam(input);
  if (directId) return directId;
  if (!input || input.includes("\\") || /[\u0000-\u001f\u007f]/.test(input))
    return null;
  let parsed: URL;
  try {
    const base = applicationOrigin ?? "https://internal.invalid";
    parsed = new URL(input, base);
    if (input.startsWith("//")) return null;
    if (input.startsWith("/")) {
      // A relative internal application path is accepted as-is.
      if (parsed.origin !== new URL(base).origin) return null;
    } else {
      // An absolute URL must match the actual application origin. Refuse
      // arbitrary domains and credentials. A scheme-less value is not a link.
      if (!applicationOrigin || !/^https?:\/\//i.test(input) ||
          parsed.origin !== new URL(applicationOrigin).origin ||
          parsed.username || parsed.password) return null;
    }
  } catch {
    return null;
  }
  if (parsed.hash) return null;
  let candidate: string | null = null;
  if (kind === "class") {
    const path = parsed.pathname.match(/^\/class\/([^/]+)\/?$/);
    if (path && !parsed.search) candidate = path[1];
    else if (parsed.pathname === "/class" &&
        [...parsed.searchParams.keys()].every(key => key === "classId") &&
        parsed.searchParams.getAll("classId").length === 1)
      candidate = parsed.searchParams.get("classId");
  } else if (kind === "adult-training") {
    if (parsed.pathname === "/learn/enroll" &&
        [...parsed.searchParams.keys()].every(key => key === "release") &&
        parsed.searchParams.getAll("release").length === 1)
      candidate = parsed.searchParams.get("release");
  } else {
    const path = parsed.pathname.match(/^\/enrichment\/([^/]+)\/?$/);
    if (path && !parsed.search) candidate = path[1];
  }
  return candidate ? decodeUuidPathParam(candidate) : null;
}

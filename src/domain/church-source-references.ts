/**
 * Church-supplied public references are editorial inputs, never institutional
 * evidence or consent to reproduce third-party assets.
 *
 * This module normalizes references ONLY. It must never be used as an outbound
 * fetch authorization boundary (DNS, redirects and resolved IPs require separate
 * server-side checks).
 */
export const churchReferenceKinds = [
  "website", "youtube", "instagram", "facebook", "tiktok",
] as const;
export type ChurchReferenceKind = typeof churchReferenceKinds[number];
export type ChurchReferenceState =
  "saved" | "fetchable" | "unsupported" | "blocked" | "failed";

export type ChurchSourceReference = {
  id: string;
  siteId: string;
  kind: ChurchReferenceKind;
  normalizedUrl: string;
  referenceState: ChurchReferenceState;
  addedByPersonId: string;
  createdAt: string;
  lastAttemptAt?: string;
};

export const churchSuggestionFields = [
  "church_history", "church_mission", "church_vision", "denomination",
  "local_community", "leadership_intro", "ministries", "welcome_message",
  "faith_and_values", "branding_hint",
] as const;
export type ChurchSuggestionField = typeof churchSuggestionFields[number];
export type ChurchContentSuggestion = {
  id: string;
  siteId: string;
  field: ChurchSuggestionField;
  proposedText: string;
  sourceReferenceId: string;
  sourcePageUrl?: string;
  retrievedAt: string;
  confidence: "high" | "medium" | "low";
  reviewDecision: "pending" | "accepted" | "edited" | "discarded";
  reviewedByPersonId?: string;
};

const socialHosts: Record<Exclude<ChurchReferenceKind, "website">, readonly string[]> = {
  youtube: ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"],
  instagram: ["instagram.com", "www.instagram.com"],
  facebook: ["facebook.com", "www.facebook.com", "m.facebook.com"],
  tiktok: ["tiktok.com", "www.tiktok.com"],
};
const trackingKeys = new Set(["fbclid", "gclid", "dclid", "mc_cid", "mc_eid", "igshid"]);

/**
 * Parse a single optional field. Host-specific matching prevents a website
 * field from quietly impersonating a social channel. URL parsing does not
 * prove that a host is safe to fetch or that the applicant owns the content.
 */
export function normalizeChurchReferenceUrl(
  kind: ChurchReferenceKind, raw: string,
): string {
  if (!churchReferenceKinds.includes(kind)) throw new Error("Unsupported church reference kind");
  if (typeof raw !== "string" || !raw.trim() || raw.length > 2048 ||
      /[\u0000-\u001f\u007f]/.test(raw)) {
    throw new Error("Provide a valid public HTTPS URL");
  }
  let url: URL;
  try { url = new URL(raw.trim()); }
  catch { throw new Error("Provide a full HTTPS URL"); }
  if (url.protocol !== "https:" || url.username || url.password ||
      url.port || !url.hostname || url.hostname.endsWith(".") ||
      url.hostname.includes("..")) {
    throw new Error("Church references require public HTTPS links without credentials or custom ports");
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") ||
      host.endsWith(".local") || host.endsWith(".internal") ||
      host.endsWith(".test") || host.endsWith(".invalid") ||
      host.endsWith(".example") ||
      /^\d+(?:\.\d+){0,3}$/.test(host) || host.includes(":") ||
      !host.includes(".")) {
    throw new Error("Use a public domain, not a local or IP address");
  }
  if (kind !== "website" && !socialHosts[kind].includes(host)) {
    throw new Error("This link does not match the selected social platform");
  }
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (trackingKeys.has(key.toLowerCase()) || key.toLowerCase().startsWith("utm_")) {
      url.searchParams.delete(key);
    }
  }
  return url.toString();
}

/** Never signal that social extraction is working merely because URL parses. */
export function initialChurchReferenceState(
  kind: ChurchReferenceKind,
): ChurchReferenceState {
  return kind === "website" ? "saved" : "unsupported";
}

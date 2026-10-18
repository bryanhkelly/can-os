/**
 * Versioned, school-authored permission language is authoritative. Neither
 * a browser-provided statement nor a fixture marker constitutes consent.
 */
export type PublishedTripPermission = {
  version: string;
  text: string;
};

export function publishedTripPermission(
  metadata: Record<string, unknown> | null | undefined,
): PublishedTripPermission | null {
  if (!metadata) return null;
  const version = metadata.permissionVersion;
  const text = metadata.permissionText;
  if (typeof version !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,79}$/.test(version)) {
    return null;
  }
  if (typeof text !== "string" || text.trim().length < 40 || text.length > 5000) {
    return null;
  }
  return { version, text: text.trim() };
}

export function permissionCanBeSigned(input: {
  tripStatus: string;
  participantStatus: string;
  departsAt: Date;
  permissionDueAt: Date | null;
  hasPermission: boolean;
}, now = new Date()): boolean {
  return input.tripStatus === "approved" &&
    input.participantStatus === "invited" &&
    input.hasPermission &&
    input.departsAt.getTime() > now.getTime() &&
    (!input.permissionDueAt || input.permissionDueAt.getTime() >= now.getTime());
}

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

/** A proposal must describe a future, correctly ordered trip and deadline. */
export function tripScheduleIsProposable(input: {
  departsAt: Date;
  returnsAt: Date;
  permissionDueAt?: Date | null;
}, now = new Date()): boolean {
  if (input.returnsAt.getTime() <= input.departsAt.getTime()) return false;
  if (input.departsAt.getTime() <= now.getTime()) return false;
  if (input.permissionDueAt &&
    (input.permissionDueAt.getTime() > input.departsAt.getTime() ||
      input.permissionDueAt.getTime() <= now.getTime())) {
    return false;
  }
  return true;
}

/** Approval and invitations close once the trip or its deadline has passed. */
export function tripScheduleIsCurrent(input: {
  departsAt: Date;
  permissionDueAt?: Date | null;
}, now = new Date()): boolean {
  if (input.departsAt.getTime() <= now.getTime()) return false;
  if (input.permissionDueAt && input.permissionDueAt.getTime() <= now.getTime()) {
    return false;
  }
  return true;
}

import { z } from "zod";

/**
 * Packages describe disjoint selectable groups of canonical dated sessions.
 * A full-camp package can overlap week packages, but a family cannot purchase
 * overlapping packages in one registration.
 */
export const enrichmentPackageSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(2).max(100),
  priceCents: z.number().int().min(0).max(10_000_000),
  sessionIds: z.array(z.string().uuid()).min(1).max(180),
}).strict();

export type EnrichmentPackage = z.infer<typeof enrichmentPackageSchema>;

export function verifyEnrichmentPackages(
  supplied: unknown,
  availableSessionIds: readonly string[],
): EnrichmentPackage[] {
  const packages = z.array(enrichmentPackageSchema).min(1).max(30).parse(supplied);
  const ids = new Set<string>();
  const available = new Set(availableSessionIds);
  for (const item of packages) {
    if (ids.has(item.id)) throw new Error("Package IDs must be unique");
    ids.add(item.id);
    if (new Set(item.sessionIds).size !== item.sessionIds.length)
      throw new Error("Package sessions must be unique");
    if (!item.sessionIds.every(id => available.has(id)))
      throw new Error("Packages can include only scheduled sessions in this season");
  }
  return packages;
}

export function readEnrichmentPackages(metadata: Record<string, unknown>): EnrichmentPackage[] {
  const parsed = z.array(enrichmentPackageSchema).max(30)
    .safeParse(metadata.enrichmentPackages);
  // Invalid published configuration never silently becomes full-season sale.
  if (!parsed.success) {
    if (metadata.enrichmentPackages === undefined) return [];
    throw new Error("Published enrichment packages are invalid");
  }
  return parsed.data;
}

export type SessionSelection = {
  packageIds: string[];
  sessionIds: string[];
  amountCents: number;
};

/** Registered selection is canonicalized by the server, never trusted from UI. */
export function selectEnrichmentPackages(
  packages: readonly EnrichmentPackage[],
  requestedIds: readonly string[] | undefined,
  fallback: { sessionIds: readonly string[]; amountCents: number },
): SessionSelection {
  if (packages.length === 0) {
    if (requestedIds?.length) throw new Error("This season does not offer selectable packages");
    if (!fallback.sessionIds.length) throw new Error("No scheduled sessions available");
    return { packageIds: [], sessionIds: [...new Set(fallback.sessionIds)].sort(),
      amountCents: fallback.amountCents };
  }
  if (!requestedIds?.length || requestedIds.length > 30 ||
    new Set(requestedIds).size !== requestedIds.length)
    throw new Error("Choose unique enrollment packages");
  const choices = requestedIds.map(id => packages.find(item => item.id === id));
  if (choices.some(item => !item)) throw new Error("One or more enrollment packages are unavailable");
  const chosen = choices as EnrichmentPackage[];
  const dates = chosen.flatMap(item => item.sessionIds);
  if (new Set(dates).size !== dates.length)
    throw new Error("Selected packages contain overlapping sessions");
  const cost = chosen.reduce((sum, item) => sum + item.priceCents, 0);
  if (!Number.isSafeInteger(cost) || cost > 100_000_000)
    throw new Error("Total package fee exceeds the supported limit");
  return { packageIds: [...requestedIds].sort(), sessionIds: dates.sort(),
    amountCents: cost };
}

export type ExistingBooking = { status: string; metadata: Record<string, unknown> };

/** Shared capacity is per dated session, not a blanket cap on a whole season. */
export function sessionOccupancy(
  sessions: readonly string[],
  registrations: readonly ExistingBooking[],
): Map<string, number> {
  const occupied = new Map(sessions.map(id => [id, 0]));
  for (const entry of registrations) {
    if (!["pending", "eligible", "conditional"].includes(entry.status)) continue;
    const selected = entry.metadata.enrichmentSelection;
    const booked = selected && typeof selected === "object" &&
      "sessionIds" in selected && Array.isArray(selected.sessionIds)
      ? selected.sessionIds.filter((id): id is string => typeof id === "string")
      : sessions; // pre-package whole-season participants consume all dates
    for (const id of new Set(booked)) if (occupied.has(id))
      occupied.set(id, (occupied.get(id) ?? 0) + 1);
  }
  return occupied;
}

export function selectedSessionWaitlisted(
  selectedSessionIds: readonly string[],
  occupancy: Map<string, number>,
  capacity: number,
): boolean {
  if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error("Invalid season capacity");
  return selectedSessionIds.some(id => !occupancy.has(id) || occupancy.get(id)! >= capacity);
}

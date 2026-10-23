/**
 * Staff-authored follow-up history attached to the canonical Action.
 * This is a contact log, NOT verified family identity or a CommunicationThread.
 * Only the owning admissions service may persist these records.
 */
export const publicInterestContactOutcomes = [
  "attempted", "reached", "tour_requested", "not_interested", "no_response",
] as const;
export type PublicInterestContactOutcome = typeof publicInterestContactOutcomes[number];

export type PublicInterestContactRecord = {
  kind: "public_interest_contact";
  requestId: string;
  outcome: PublicInterestContactOutcome;
  actorPersonId: string;
  recordedAt: string;
  note: string;
  nextFollowUpAt: string | null;
};

const outcomes: ReadonlySet<string> = new Set(publicInterestContactOutcomes);
const maxEntries = 100;

export function publicInterestContactHistory(
  evidence: readonly Record<string, unknown>[],
): PublicInterestContactRecord[] {
  return evidence.filter((entry): entry is PublicInterestContactRecord =>
    entry.kind === "public_interest_contact" &&
    typeof entry.requestId === "string" &&
    typeof entry.actorPersonId === "string" &&
    typeof entry.recordedAt === "string" &&
    typeof entry.outcome === "string" && outcomes.has(entry.outcome) &&
    typeof entry.note === "string" &&
    (entry.nextFollowUpAt === null || typeof entry.nextFollowUpAt === "string")
  );
}

/** The request UUID enforces a single outcome per intent, even when the
 * browser retries the same mutation. Never overwrite a recorded contact. */
export function appendPublicInterestContact(
  evidence: readonly Record<string, unknown>[],
  record: PublicInterestContactRecord,
): { changed: boolean; evidence: Record<string, unknown>[] } {
  const history = publicInterestContactHistory(evidence);
  const prior = history.find(item => item.requestId === record.requestId);
  if (prior) {
    if (prior.outcome !== record.outcome || prior.note !== record.note ||
        prior.nextFollowUpAt !== record.nextFollowUpAt)
      throw new Error("Contact request ID was reused with different details");
    return { changed: false, evidence: [...evidence] };
  }
  if (history.length >= maxEntries)
    throw new Error("Contact history limit reached; use the secure admissions record");
  return { changed: true, evidence: [...evidence, record] };
}

export function publicInterestOutcomeIsReached(outcome: PublicInterestContactOutcome): boolean {
  return outcome === "reached" || outcome === "tour_requested";
}

export function publicInterestOutcomeCloses(outcome: PublicInterestContactOutcome): boolean {
  return outcome === "not_interested";
}

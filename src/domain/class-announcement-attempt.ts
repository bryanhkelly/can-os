/** Immutable identity and payload for a potentially uncertain announcement POST. */
export type ClassAnnouncementAttempt = Readonly<{
  id: string;
  title: string;
  body: string;
}>;

/**
 * The server rejects an idempotency-key retry with a different payload.
 * Keep the original snapshot across edits and transport failures until a
 * confirmed command response; subsequent edits are a separate draft.
 */
export function getOrCreateAnnouncementAttempt(
  previous: ClassAnnouncementAttempt | null,
  draft: { title: string; body: string },
  createId: () => string,
): ClassAnnouncementAttempt {
  return previous ?? {
    id: createId(),
    title: draft.title.trim(),
    body: draft.body.trim(),
  };
}

/** A refresh failure still means the command succeeded on the server. */
export function wasAnnouncementAccepted(status: string): boolean {
  return status === "saved" || status === "refresh-failed";
}

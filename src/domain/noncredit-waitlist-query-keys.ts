/**
 * The learner's exact waitlist record and paginated waitlist history have
 * different React Query result shapes. Never allow their cache keys to collide.
 * Keep the common root for source-owned mutation invalidation.
 */
const root = "my-noncredit-waitlist" as const;

export const noncreditWaitlistQueryKeys = {
  root: [root] as const,
  detail: (scope: string, releaseId: string | null) =>
    [root, "detail", scope, releaseId] as const,
  pages: (scope: string, releaseId?: string) =>
    [root, "pages", scope, releaseId ?? "all"] as const,
};

import { z } from "zod";
import { normalizeAccessEmail } from "./access-tokens";

/** Names are self-provided profile labels, not independently verified legal identity. */
export const personalCanSignupSchema = z.object({
  firstName: z.string().trim().min(1).max(80).refine(v => !/[<>\x00-\x1f]/.test(v)),
  lastName: z.string().trim().min(1).max(80).refine(v => !/[<>\x00-\x1f]/.test(v)),
  email: z.string().trim().transform(normalizeAccessEmail),
  returnTo: z.string().optional(),
}).strict();

export function isAccountOnlyGrant(grant: {
  role: string; organizationId: string | null; siteId: string | null;
}): boolean {
  return grant.role === "account_holder" && grant.organizationId === null && grant.siteId === null;
}

/** Personal workspaces do not inherit organizational authority. */
export function eligiblePersonalLanding(role: string): string | undefined {
  return role === "account_holder" ? "/account/" : undefined;
}

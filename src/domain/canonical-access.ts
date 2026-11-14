import { z } from "zod";
import { AuthorizationError, type CommandContext } from "./command-context";

export const canonicalAccessRoles = ["site_admin", "registrar", "blueprint_reviewer", "learner"] as const;

export const canonicalSessionRowSchema = z.object({
  account_id: z.string().uuid(),
  session_id: z.string().uuid(),
  grant_id: z.string().uuid(),
  person_id: z.string().uuid(),
  role_code: z.enum(canonicalAccessRoles),
  organization_id: z.string().uuid(),
  site_id: z.string().uuid().nullable(),
}).strict();

export type CanonicalSessionRow = z.infer<typeof canonicalSessionRowSchema>;

export const canonicalSessionCookie = "__Host-can_os_v3_session";
export const canonicalAuthReaderDatabaseRole = "can_v30_canonical_auth_reader";

/** Authority comes from a current native session, never user-submitted roles. */
export function projectCanonicalCommandContext(row: CanonicalSessionRow): CommandContext {
  if (row.role_code === "blueprint_reviewer" && row.site_id !== null) {
    throw new AuthorizationError("organization-only independent reviewer");
  }
  if (row.role_code === "learner" && row.site_id !== null) {
    throw new AuthorizationError("organization-scoped learner");
  }
  if (["site_admin", "registrar"].includes(row.role_code) && !row.site_id) {
    throw new AuthorizationError("canonical Site-scoped administrator");
  }
  const capabilities = row.role_code === "learner"
    ? ["learning.participate", "learning.progress", "learning.survey.respond"]
    : row.role_code === "blueprint_reviewer"
      ? ["blueprint.read", "blueprint.review"]
      : ["blueprint.read", "blueprint.configure", "blueprint.execute", "program.launch.start", "noncredit.completion.decide", "noncredit.assessment.finalize"];
  return {
    actorPersonId: row.person_id,
    role: row.role_code,
    capabilities: new Set(capabilities),
    scope: {
      organizationIds: [row.organization_id],
      siteIds: row.site_id ? [row.site_id] : [],
    },
  };
}

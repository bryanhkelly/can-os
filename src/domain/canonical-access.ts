import { z } from "zod";
import { AuthorizationError, type CommandContext } from "./command-context";

export const canonicalAccessRoles = ["site_admin", "registrar", "blueprint_reviewer", "survey_reviewer", "learner", "room_facilitator"] as const;

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

const canonicalSiteStaffCapabilities = [
  // Role only establishes baseline Site operations. More sensitive decisions
  // still require independent resource/organization/SQL authority.
  "learning.room.facilitate", "blueprint.read", "blueprint.configure",
  "blueprint.execute", "program.launch.start",
  "noncredit.enrollment.read", "noncredit.enrollment.manage",
  "noncredit.completion.decide", "noncredit.assessment.finalize",
  "noncredit.assessment.provision",
  "credential.preview", "survey.draft.create", "survey.publish",
  "class.manage",
] as const;

/**
 * A Site Admin or Registrar is not automatically an approved credential issuer.
 * Issuance requires a separate positive issuer authority and must not become
 * available merely by enabling the global feature flag.
 */
export const canonicalRoleCapabilities: Readonly<Record<
  (typeof canonicalAccessRoles)[number], readonly string[]
>> = Object.freeze({
  site_admin: canonicalSiteStaffCapabilities,
  registrar: canonicalSiteStaffCapabilities,
  blueprint_reviewer: ["blueprint.read", "blueprint.review"],
  survey_reviewer: ["survey.review"],
  learner: ["learning.participate", "learning.progress", "learning.survey.respond"],
  room_facilitator: ["learning.room.facilitate"],
});

/**
 * A verified native grant or an independently linked CAN staff grant can be
 * projected into the same narrowly scoped canonical authorization context.
 * Neither caller can provide these fields from a browser payload.
 */
export function projectCanonicalPrincipalContext(row: Pick<CanonicalSessionRow,
  "person_id" | "role_code" | "organization_id" | "site_id">): CommandContext {
  if (["blueprint_reviewer", "survey_reviewer"].includes(row.role_code) && row.site_id !== null) {
    throw new AuthorizationError("organization-only independent reviewer");
  }
  if (row.role_code === "learner" && row.site_id !== null) {
    throw new AuthorizationError("organization-scoped learner");
  }
  if (["site_admin", "registrar", "room_facilitator"].includes(row.role_code) && !row.site_id) {
    throw new AuthorizationError("canonical Site-scoped administrator");
  }
  const capabilities = canonicalRoleCapabilities[row.role_code];
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

/** Native session projection shares exact role/capability rules with CAN SSO. */
export function projectCanonicalCommandContext(row: CanonicalSessionRow): CommandContext {
  return projectCanonicalPrincipalContext(row);
}

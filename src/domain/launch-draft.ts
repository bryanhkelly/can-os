import { z } from "zod";
import type { AccessContext } from "@/domain/access-context";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { hasRegistrarAuthority } from "@/domain/school-roles";
import { programTypes } from "@/domain/program-offerings";

const text = z.string().max(1000);
const schoolFields = z.object({
  type: z.enum(programTypes), summerCreditBearing: z.boolean(), name: text, targetOpeningDate: text,
  slug: text, gradeMin: text, gradeMax: text, onsite: z.boolean(), asynchronous: z.boolean(),
  liveOnline: z.boolean(), onsiteDaysPerWeek: text, hostOrganizationId: text, jurisdictionId: text,
  academicProviderOrganizationId: text, creditIssuingOrganizationId: text, siteId: text,
  newSiteName: text, newSiteSlug: text, newSiteTimezone: text,
  newSiteAddress: z.object({ street1: text, street2: text, city: text, state: text,
    postalCode: text, country: text, county: text }).strict(),
}).strict();
const familyFields = z.object({
  requestId: z.string().uuid(), programId: text, schoolYearId: text, studentOptionId: text,
  householdId: text, firstName: text, lastName: text, grade: text,
}).strict();
const studentFields = z.object({
  preferredName: z.string().max(80), pronouns: z.string().max(60), interests: z.string().max(700),
  courseIds: z.array(z.string().uuid()).max(50),
  profileBaseline: z.object({
    preferredName: z.string().max(80), pronouns: z.string().max(60), interests: z.string().max(700),
  }).strict().optional(),
}).strict();
const staffFields = z.object({ notes: z.string().max(4000) }).strict();

export const launchDraftValueSchema = z.discriminatedUnion("audience", [
  z.object({ audience: z.literal("school"), fields: schoolFields }).strict(),
  z.object({ audience: z.literal("family"), fields: familyFields }).strict(),
  z.object({ audience: z.literal("student"), fields: studentFields }).strict(),
  z.object({ audience: z.literal("staff"), fields: staffFields }).strict(),
]);
export const launchDraftSelectionSchema = z.object({
  audience: z.enum(["school", "family", "student", "staff"]),
  context: z.string().max(200).regex(/^[a-zA-Z0-9:-]*$/),
}).strict();
export const saveLaunchDraftSchema = launchDraftSelectionSchema.extend({
  expectedRevision: z.number().int().nonnegative(),
  value: launchDraftValueSchema,
}).strict().refine(input => input.audience === input.value.audience, "Draft audience must match");
export type LaunchDraftValue = z.infer<typeof launchDraftValueSchema>;
export type LaunchDraftSelection = z.infer<typeof launchDraftSelectionSchema>;
export type LaunchDraftRecord = { value: LaunchDraftValue; revision: number; savedAt: string };

export function studentDraftMatchesProfile(
  fields: Extract<LaunchDraftValue, { audience: "student" }>["fields"],
  profile: { preferredName: string; preferredPronouns: string; interests: string[] },
) {
  const baseline = fields.profileBaseline;
  return Boolean(baseline && baseline.preferredName === profile.preferredName &&
    baseline.pronouns === profile.preferredPronouns && baseline.interests === profile.interests.join(", "));
}

export function assertLaunchDraftAudience(actor: AccessContext, audience: LaunchDraftSelection["audience"]) {
  assertCapability(actor, "launch.draft.manage");
  const allowed = audience === "school" ? hasRegistrarAuthority(actor.role)
    : audience === "family" ? actor.role === "guardian"
    : audience === "student" ? actor.role === "student"
    : ["teacher", "room_facilitator", "site_leader", "site_staff", "specialist", "counselor",
      "registrar", "site_admin", "paraeducator", "site_website_editor",
      "safeguarding_lead", "safeguarding_responder"].includes(actor.role);
  if (!actor.actorPersonId || !allowed) throw new AuthorizationError("own launch preparation draft");
}

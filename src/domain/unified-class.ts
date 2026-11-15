import { z } from "zod";

// Product kind is explicitly governed. Course count alone does not establish the type.
export const publisherOfferingKindSchema = z.enum(["course", "program", "other"]);
export type PublisherOfferingKind = z.infer<typeof publisherOfferingKindSchema>;
export const classDeliveryModeSchema = z.enum(["self_paced", "scheduled", "facilitated", "hybrid"]);
export const classVisibilitySchema = z.enum(["public", "unlisted", "private"]);
export const classEnrollmentMethodSchema = z.enum(["self", "invitation", "assignment", "approval"]);
export const classEnrollmentStatusSchema = z.enum(["pending", "active", "completed", "withdrawn", "cancelled"]);
export const learnerAwardIntentSchema = z.enum(["credit", "certificate", "participation", "audit", "unspecified"]);
export const classAwardKindSchema = z.enum(["academic_credit", "certificate", "credential", "participation"]);
const uuid = z.string().uuid();

// The Class instantiates exactly one Course version; the server must verify
// current published content, adoption, operator and any Site authority.
export const classDefinitionSchema = z.object({
  deploymentId: uuid,
  adoptionId: uuid,
  offeringVersionId: uuid,
  courseVersionId: uuid,
  operatingOrganizationId: uuid,
  siteId: uuid.nullable(),
  title: z.string().trim().min(3).max(200),
  deliveryMode: classDeliveryModeSchema,
}).strict();
export type ClassDefinition = z.infer<typeof classDefinitionSchema>;

const dateTime = z.string().datetime({ offset: true });
// A Class Offering exists for assigned/private Classes too; its public listing
// and its enrollment mechanism are independent settings.
export const classOfferingTermsSchema = z.object({
  visibility: classVisibilitySchema,
  enrollmentMethod: classEnrollmentMethodSchema,
  opensAt: dateTime.nullable(),
  closesAt: dateTime.nullable(),
  capacity: z.number().int().min(1).nullable(),
}).strict().superRefine((terms, ctx) => {
  if (terms.opensAt && terms.closesAt &&
      Date.parse(terms.closesAt) <= Date.parse(terms.opensAt)) {
    ctx.addIssue({ code: "custom", path: ["closesAt"],
      message: "Registration must close after it opens" });
  }
});
export type ClassOfferingTerms = z.infer<typeof classOfferingTermsSchema>;

// Credit intent is a property of an individual enrollment, not a new type of
// learner or a promise of an award.
export const classEnrollmentRequestSchema = z.object({
  classId: uuid,
  classOfferingVersionId: uuid,
  learnerPersonId: uuid,
  enrollmentMethod: classEnrollmentMethodSchema,
  awardIntent: learnerAwardIntentSchema,
}).strict();
export type ClassEnrollmentRequest = z.infer<typeof classEnrollmentRequestSchema>;

export function validOfferingProductKind(
  kind: PublisherOfferingKind, courseCount: number, hasOtherRequiredComponents: boolean,
): boolean {
  if (!Number.isInteger(courseCount) || courseCount < 0) return false;
  if (kind === "course") return courseCount === 1 && !hasOtherRequiredComponents;
  if (kind === "program") return courseCount > 0 || hasOtherRequiredComponents;
  return true;
}
export function publisherOfferingLabel(kind: PublisherOfferingKind): string {
  return kind === "course" ? "Course Offering" :
    kind === "program" ? "Program Offering" : "Offering";
}
export function visibleInPublicCatalog(visibility: z.infer<typeof classVisibilitySchema>): boolean {
  return visibility === "public";
}

// This is only a final issuance prerequisite check; a verified command, scoped
// issuer grant, policy evidence and audit event are also required.
export type ClassAwardDecision = {
  outcomeRecorded: boolean;
  requirementsSatisfied: boolean;
  learnerEligible: boolean;
  issuerAuthorized: boolean;
  policyApproved: boolean;
  awarded: boolean;
};
export function mayIssueClassAward(
  decision: ClassAwardDecision,
  intent: z.infer<typeof learnerAwardIntentSchema>,
  awardKind: z.infer<typeof classAwardKindSchema>,
): boolean {
  if (intent === "audit" || intent === "unspecified") return false;
  if (awardKind === "academic_credit" && intent !== "credit") return false;
  if ((awardKind === "certificate" || awardKind === "credential") && intent !== "certificate") return false;
  if (awardKind === "participation" && intent !== "participation") return false;
  return decision.outcomeRecorded && decision.requirementsSatisfied &&
    decision.learnerEligible && decision.issuerAuthorized &&
    decision.policyApproved && decision.awarded;
}

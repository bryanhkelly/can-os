import { z } from "zod";

// Product kind is explicitly governed. Course count alone does not establish the type.
export const publisherOfferingKindSchema = z.enum(["course", "program", "other"]);
export type PublisherOfferingKind = z.infer<typeof publisherOfferingKindSchema>;
export const classDeliveryModeSchema = z.enum(["self_paced", "scheduled", "facilitated", "hybrid"]);
export const classVisibilitySchema = z.enum(["public", "unlisted", "private"]);
export const classEnrollmentMethodSchema = z.enum(["self", "invitation", "assignment", "approval"]);
export const classEnrollmentStatusSchema = z.enum(["pending", "active", "completed", "withdrawn", "cancelled"]);
export const classCreditModeSchema = z.enum(["for_credit", "audit", "not_applicable"]);
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
  capacity:z.number().int().positive().nullable().optional(),
  deliveryMode: classDeliveryModeSchema,
}).strict();
export type ClassDefinition = z.infer<typeof classDefinitionSchema>;

const dateTime = z.string().datetime({ offset: true });
// Class Offering is OPTIONAL: visibility and enrollment methods are publication terms,
// not the Class identity or required source for assigned enrollment.
export const classOfferingTermsSchema = z.object({
  visibility: classVisibilitySchema,
  enrollmentMethods: z.array(classEnrollmentMethodSchema).min(1).max(4)
    .refine(methods => new Set(methods).size === methods.length, "Enrollment methods must be unique"),
  opensAt: dateTime.nullable(),
  closesAt: dateTime.nullable(),
  capacity: z.number().int().min(1).nullable(),
  allowedCreditModes: z.array(classCreditModeSchema).min(1).max(3)
    .refine(modes => new Set(modes).size === modes.length, "Credit modes must be unique"),
  consentVersion: z.string().trim().min(3).max(80).nullable(),
  consentText: z.string().trim().min(25).max(10000).nullable(),
}).strict().superRefine((terms, ctx) => {
  if (terms.enrollmentMethods.includes("self") && (!terms.consentVersion || !terms.consentText)) {
    ctx.addIssue({code:"custom",path:["consentText"],message:"Self-enrollment requires published participation terms"});
  }
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
  classOfferingVersionId: uuid.nullable(),
  learnerPersonId: uuid,
  enrollmentMethod: classEnrollmentMethodSchema,
  creditMode: classCreditModeSchema,
}).strict();
export type ClassEnrollmentRequest = z.infer<typeof classEnrollmentRequestSchema>;

/** A Class Offering is required for self-registration only. Private invitation,
 * approval and assignment require their own authorized consent/eligibility
 * workflows, not a mandatory marketing publication. */
export function enrollmentNeedsOffering(method:z.infer<typeof classEnrollmentMethodSchema>):boolean{
  return method==="self";
}

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
  creditMode: z.infer<typeof classCreditModeSchema>,
  awardKind: z.infer<typeof classAwardKindSchema>,
): boolean {
  if (awardKind === "academic_credit" && creditMode !== "for_credit") return false;
  return decision.outcomeRecorded && decision.requirementsSatisfied &&
    decision.learnerEligible && decision.issuerAuthorized &&
    decision.policyApproved && decision.awarded;
}

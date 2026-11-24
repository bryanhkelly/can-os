import { z } from "zod";
import { goDestinationSchema } from "./site-go-links";
import { containsProtectedInstitutionalClaim } from "./public-claims-policy";

/**
 * Cross-domain public engagement vocabulary. This models an invitation and
 * experience, NEVER the permission to operate a business workflow.
 */
export const engagementChannels=["web","email","sms","qr","social","partner","other"] as const;
export const engagementChannelSchema=z.enum(engagementChannels);
export type EngagementChannel=z.infer<typeof engagementChannelSchema>;
export const engagementChannelLabels:Record<EngagementChannel,string>={
  web:"Website / sharing",email:"Email",sms:"Text message",qr:"QR code",
  social:"Social",partner:"Partner",other:"Other",
};
export const engagementDomains = [
  "outreach", "learning", "employment", "partnerships", "events",
  "funding", "research", "community",
] as const;
export const engagementSubjectKinds = [
  "initiative", "organization", "site", "program", "course", "class",
  "event", "position", "partnership", "funding", "survey", "service",
] as const;
export const engagementAudienceKinds = [
  "public", "families", "youth", "adults", "older_adults",
  "staff", "volunteers", "partners", "sponsors", "organizations",
] as const;
export const engagementInteractions = [
  "discover", "respond", "apply", "register", "schedule",
  "contribute", "accept", "continue",
] as const;
export const engagementOutcomeKinds = [
  "viewed", "inquiry", "response", "application", "registration",
  "appointment", "contribution", "agreement", "participation",
] as const;
export const engagementOwnerSchema = z.discriminatedUnion("kind", [
  z.object({ kind:z.literal("platform") }).strict(),
  z.object({ kind:z.literal("organization"), organizationId:z.string().uuid() }).strict(),
  z.object({ kind:z.literal("site"), siteId:z.string().uuid() }).strict(),
  z.object({ kind:z.literal("program"), programId:z.string().uuid() }).strict(),
]);
export type EngagementOwner = z.infer<typeof engagementOwnerSchema>;

export const engagementExecutionSchema = z.discriminatedUnion("mode", [
  z.object({
    mode:z.literal("redirect"),
    destination:goDestinationSchema,
  }).strict(),
  z.object({
    mode:z.literal("page"),
    template:z.enum(["information", "invitation", "opportunity"]),
    action:goDestinationSchema,
    actionLabel:z.string().trim().min(2).max(80),
  }).strict(),
]);
export type EngagementExecution = z.infer<typeof engagementExecutionSchema>;

export const engagementDefinitionSchema = z.object({
  domain:z.enum(engagementDomains),
  subject:z.object({
    kind:z.enum(engagementSubjectKinds),
    id:z.string().uuid().nullable().default(null),
    label:z.string().trim().min(2).max(160),
  }).strict(),
  audience:z.array(z.enum(engagementAudienceKinds)).min(1).max(6),
  interaction:z.enum(engagementInteractions),
  expectedOutcome:z.enum(engagementOutcomeKinds),
  presentation:z.object({
    headline:z.string().trim().min(3).max(160),
    summary:z.string().trim().min(10).max(1200),
    detail:z.string().trim().max(3000).optional(),
    /** Exact governed Site Brand identity copied server-side when publishing. */
    brandVersionId:z.string().uuid().optional(),
  }).strict(),
  execution:engagementExecutionSchema,
  /** Optional attribution, never an authorization/affiliation assertion. */
  source:z.object({
    marketingPackageId:z.string().uuid().optional(),
  }).strict().optional(),
}).strict();

export type EngagementDefinition = z.infer<typeof engagementDefinitionSchema>;

/** Public copy needs review rather than unverified institutional approval claims. */
export function engagementRequiresClaimReview(definition:EngagementDefinition):boolean {
  return containsProtectedInstitutionalClaim([
    definition.subject.label,
    definition.presentation.headline,
    definition.presentation.summary,
    definition.presentation.detail??"",
    definition.execution.mode==="page"?definition.execution.actionLabel:"",
  ].join(" "));
}

export function isEngagementExecutable(value:unknown):value is EngagementDefinition {
  return engagementDefinitionSchema.safeParse(value).success;
}

/**
 * All dimensions are independent. Expected outcomes are intentions, not facts:
 * a click must NEVER be recorded as an application or completed training.
 */
export function engagementContextSummary(value:EngagementDefinition) {
  return {
    domain:value.domain, subjectKind:value.subject.kind,
    interaction:value.interaction, audiences:[...value.audience],
    executionMode:value.execution.mode,
  };
}

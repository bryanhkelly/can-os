import {z} from "zod";
const uuid=z.string().uuid();
const common={
  evidenceVersionId:uuid,
  reason:z.string().trim().min(10).max(1000),
};
export const requestSchema=z.discriminatedUnion("purpose",[
  z.object({
    purpose:z.literal("completion_correction"),
    registrationId:uuid,
    expectedDecisionId:uuid,
    approvedOutcome:z.enum(["not_yet_completed","voided"]),
    ...common,
  }).strict(),
  z.object({
    purpose:z.literal("award_revocation"),
    issuanceId:uuid,
    ...common,
  }).strict(),
  z.object({
    purpose:z.literal("class_completion_decision"),
    classEnrollmentId:uuid,
    expectedClassOutcomeId:uuid.nullable(),
    approvedOutcome:z.enum(["completed","not_yet_completed","voided"]),
    ...common,
  }).strict(),
]);
export type ReviewIntent=z.infer<typeof requestSchema>;
export const decisionSchema=z.object({
  requestId:uuid,decision:z.enum(["approve","reject"]),
}).strict();
export const pendingQueueInput=z.object({
  page:z.number().int().min(0).max(100).default(0),
}).strict();

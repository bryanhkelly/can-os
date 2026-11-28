import { z } from "zod";

const uuid = z.string().uuid();

/** A reviewer chooses one decision for each selected component. */
export const blueprintComponentReviewSchema = z.object({
  componentId: uuid,
  decision: z.enum(["approved", "conditional", "denied"]),
  evidenceVersionId: uuid.nullable().default(null),
  conditions: z.string().trim().max(2000).nullable().default(null),
}).strict().refine(
  item => item.decision !== "approved" || item.evidenceVersionId !== null,
  { message: "Approved components require independent supporting evidence." },
);

export const decideBlueprintReviewInputSchema = z.object({
  reviewId: uuid,
  configurationVersionId: uuid,
  decision: z.enum(["approved", "conditional", "rejected"]),
  evidenceVersionId: uuid.nullable().default(null),
  rationale: z.string().trim().min(8).max(4000),
  components: z.array(blueprintComponentReviewSchema).max(200).default([]),
}).strict().superRefine((input, context) => {
  if (input.decision === "approved" && !input.evidenceVersionId) {
    context.addIssue({
      code: "custom",
      path: ["evidenceVersionId"],
      message: "Blueprint approval requires supporting evidence.",
    });
  }
  const ids = input.components.map(item => item.componentId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({
      code: "custom",
      path: ["components"],
      message: "A component may only be reviewed once per decision.",
    });
  }
  if (input.decision === "approved" &&
      input.components.some(item => item.decision !== "approved")) {
    context.addIssue({
      code: "custom",
      path: ["components"],
      message: "An approved Blueprint cannot contain conditional or denied components.",
    });
  }
});

export type DecideBlueprintReviewInput = z.infer<typeof decideBlueprintReviewInputSchema>;

export const blueprintReviewReadInputSchema = z.object({
  configurationVersionId: uuid,
}).strict();

/** Bounded page of authorized append-only decisions for a single frozen version. */
export const blueprintReviewHistoryInputSchema = z.object({
  configurationVersionId: uuid,
  page: z.number().int().min(0).max(100).default(0),
}).strict();

/** Exact request receipt, stored with the existing immutable review. Sort only
 * component IDs: their order is presentation, not part of the decision. */
export function blueprintReviewReceipt(input:DecideBlueprintReviewInput){
  return {rationale:input.rationale,componentDecisions:[...input.components]
    .sort((a,b)=>a.componentId.localeCompare(b.componentId))
    .map(c=>({componentId:c.componentId,decision:c.decision,evidenceVersionId:c.evidenceVersionId,conditions:c.conditions}))};
}
export function matchesBlueprintReviewReceipt(stored:unknown,input:DecideBlueprintReviewInput):boolean{
  if(!stored||typeof stored!=="object"||Array.isArray(stored))return false;
  const receipt=stored as Record<string,unknown>;
  if(receipt.rationale!==input.rationale||!Array.isArray(receipt.componentDecisions))return false;
  const parsed=z.array(blueprintComponentReviewSchema).safeParse(receipt.componentDecisions);
  if(!parsed.success)return false;
  const original=blueprintReviewReceipt({...input,components:parsed.data});
  return JSON.stringify(original)===JSON.stringify(blueprintReviewReceipt(input));
}

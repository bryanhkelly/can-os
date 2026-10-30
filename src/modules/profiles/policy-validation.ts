import { z } from "zod";
import type { PolicyExpression, EvidenceRule } from "@/domain/qualification-policy";
/** Server boundary: reject malformed and excessive policy trees before saving published rules. */
const credential=z.object({op:z.literal("credential"),type:z.string().min(1).max(150),issuer:z.string().max(200).optional(),jurisdiction:z.string().max(150).optional()}).strict();
const evidence=z.object({op:z.literal("evidence"),type:z.string().min(1).max(150)}).strict();
const expression:z.ZodType<PolicyExpression>=z.lazy(()=>z.union([
 credential,
 z.object({op:z.literal("all"),rules:z.array(expression).min(1).max(25)}).strict(),
 z.object({op:z.literal("any"),rules:z.array(expression).min(1).max(25)}).strict(),
 z.object({op:z.literal("atLeast"),count:z.number().int().positive(),rules:z.array(expression).min(1).max(25)}).strict(),
]));
const evidenceExpression:z.ZodType<EvidenceRule>=z.lazy(()=>z.union([
 evidence,
 z.object({op:z.literal("all"),rules:z.array(evidenceExpression).min(1).max(25)}).strict(),
 z.object({op:z.literal("any"),rules:z.array(evidenceExpression).min(1).max(25)}).strict(),
]));
function depth(value:unknown):number{
 if(!value||typeof value!=="object"||!("rules" in value))return 1;
 const rules=(value as {rules?:unknown}).rules;
 return Array.isArray(rules)?1+Math.max(0,...rules.map(depth)):1;
}
export function parseQualificationPolicy(value:unknown):PolicyExpression{
 const result=expression.parse(value);
 if(depth(result)>8)throw new Error("Qualification policy nesting exceeds eight levels");
 if(result.op==="atLeast"&&result.count>result.rules.length)throw new Error("Policy threshold exceeds number of choices");
 return result;
}
export function parseEvidencePolicy(value:unknown):EvidenceRule{
 const result=evidenceExpression.parse(value);
 if(depth(result)>8)throw new Error("Evidence policy nesting exceeds eight levels");
 return result;
}

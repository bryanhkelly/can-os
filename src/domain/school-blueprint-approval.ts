import { z } from "zod";
import { containsProtectedInstitutionalClaim } from "./site-local-content";

/** Private institutional review findings; not legal school authorization. */
export const blueprintDecisionSchema=z.object({
  subjectKind:z.enum(["program","item"]),
  subjectId:z.string().uuid(),
  decision:z.enum(["approved","changes_required","future","declined"]),
  publicVisibility:z.enum(["confirmed","under_review","future","hidden"]),
  publicSummary:z.string().trim().max(600).nullable().default(null),
  requiredForOpening:z.boolean().default(false),
  conditions:z.record(z.unknown()).default({}),
  evidence:z.record(z.unknown()).default({}),
  effectiveFrom:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  effectiveThrough:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
}).strict().superRefine((v,ctx)=>{
  if(v.publicVisibility==="confirmed" && v.decision!=="approved")
    ctx.addIssue({code:"custom",message:"Only CAN-approved scope may be described as confirmed"});
  if(v.decision==="declined" && v.publicVisibility!=="hidden")
    ctx.addIssue({code:"custom",message:"Declined proposals cannot appear in the prospectus"});
  if(v.effectiveFrom && v.effectiveThrough && v.effectiveThrough<v.effectiveFrom)
    ctx.addIssue({code:"custom",message:"Invalid decision effective dates"});
});

export const blueprintReviewSchema=z.object({
  siteId:z.string().uuid(),reviewRequestId:z.string().uuid(),
  expectedApprovedVersion:z.number().int().min(0),
  schoolScopeStatement:z.string().trim().min(20).max(1500),
  decisions:z.array(blueprintDecisionSchema).min(1).max(150),
}).strict();

export const prospectusItemSchema=z.object({
  sourceId:z.string().uuid(),sourceKind:z.enum(["program","item"]),
  title:z.string().trim().min(2).max(160),
  summary:z.string().trim().max(600),
  state:z.enum(["confirmed","under_review","future"]),
  canApprovalVersion:z.number().int().positive().nullable(),
}).strict();
export const publicProspectusSchema=z.object({
  version:z.literal(1),
  heading:z.string().trim().min(5).max(120),
  introduction:z.string().trim().min(20).max(1000),
  notice:z.string().trim().min(20).max(350),
  sourceBlueprintRevision:z.number().int().positive(),
  canApprovalVersion:z.number().int().positive().nullable(),
  items:z.array(prospectusItemSchema).min(1).max(75),
}).strict();
export type PublicBlueprintProspectus=z.infer<typeof publicProspectusSchema>;

export function assertPublicProspectusClaims(prospectus:PublicBlueprintProspectus) {
  for(const value of [prospectus.heading,prospectus.introduction,...prospectus.items.map(i=>i.title),
    ...prospectus.items.map(i=>i.summary)]) {
    if(/[<>]/.test(value) || containsProtectedInstitutionalClaim(value))
      throw new Error("Prospectus contains restricted institutional claims. Revise the copy.");
  }
  for(const item of prospectus.items) {
    if(item.state==="confirmed" && prospectus.canApprovalVersion===null)
      throw new Error("A confirmed offering needs an approved Blueprint baseline.");
    if(item.state==="confirmed" && item.canApprovalVersion!==prospectus.canApprovalVersion)
      throw new Error("Confirmed offering must reference the same approved baseline.");
    if(item.state!=="confirmed" && item.canApprovalVersion!==null)
      throw new Error("Proposed offerings must not claim CAN approval.");
  }
}

export function blueprintRevisionDiff(
  prior:{programs?:Array<{id:string;[key:string]:unknown}>;items?:Array<{id:string;[key:string]:unknown}>},
  next:{programs?:Array<{id:string;[key:string]:unknown}>;items?:Array<{id:string;[key:string]:unknown}>},
){
  const compared=(a:Array<{id:string;[key:string]:unknown}>=[],b:Array<{id:string;[key:string]:unknown}>=[])=>
  {const old=new Map(a.map(x=>[x.id,JSON.stringify(x)]));const current=new Map(b.map(x=>[x.id,JSON.stringify(x)]));
    return {added:[...current.keys()].filter(id=>!old.has(id)),
      removed:[...old.keys()].filter(id=>!current.has(id)),
      changed:[...current.keys()].filter(id=>old.has(id)&&old.get(id)!==current.get(id))};};
  return {programs:compared(prior.programs,next.programs),items:compared(prior.items,next.items)};
}

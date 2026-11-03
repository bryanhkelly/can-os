import { z } from "zod";

const evidenceSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  authority: z.string().min(1),
  checkedAt: z.string().datetime(),
});
const requirementSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  responsibleParty: z.enum(["can","church","family"]),
  phase: z.enum(["before_opening","before_enrollment","follow_up"]),
  evidenceIds: z.array(z.string()).default([]),
});
export const jurisdictionProfileSchema = z.object({
  summary: z.string().min(1),
  operatingModels: z.array(z.string()).default([]),
  fundingPrograms: z.array(z.object({
    id: z.string().min(1), name: z.string().min(1),
    summary: z.string().min(1),
    eligibilityStatus: z.enum(["verified","conditional","under_review","unknown"]),
    evidenceIds: z.array(z.string()).default([]),
  })).default([]),
  requirements: z.array(requirementSchema).default([]),
  evidence: z.array(evidenceSchema).default([]),
}).superRefine((profile,ctx)=>{
  const ids=new Set(profile.evidence.map(e=>e.url));
  for(const [i,r] of profile.requirements.entries())
    for(const key of r.evidenceIds)
      if(!ids.has(key))ctx.addIssue({code:"custom",path:["requirements",i,"evidenceIds"],message:"Unknown evidence URL"});
  for(const [i,f] of profile.fundingPrograms.entries())
    for(const key of f.evidenceIds)
      if(!ids.has(key))ctx.addIssue({code:"custom",path:["fundingPrograms",i,"evidenceIds"],message:"Unknown evidence URL"});
});
export type JurisdictionProfile = z.infer<typeof jurisdictionProfileSchema>;

/** Public/setup projection of canonical state policy. Never duplicates launch state. */
export function schoolLaunchJurisdictionSummary(profile: JurisdictionProfile) {
  return {
    summary: profile.summary,
    operatingModels: profile.operatingModels,
    fundingPrograms: profile.fundingPrograms.map(({id,name,summary,eligibilityStatus})=>({id,name,summary,eligibilityStatus})),
    actions: profile.requirements.map(({id,title,description,responsibleParty,phase})=>({id,title,description,responsibleParty,phase})),
  };
}

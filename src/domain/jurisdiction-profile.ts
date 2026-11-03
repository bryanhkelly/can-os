import { z } from "zod";

/** An HTTPS source is not necessarily government-issued guidance. Non-.gov
 * official agency hosts need an explicit independently reviewed attribution. */
export function isOfficialJurisdictionSource(source:{
  url:string;authority:string;checkedAt:string;
  officialAuthorityVerified?:boolean;officialAuthorityVerificationNote?:string;
}):boolean {
  let url:URL;
  try {url=new URL(source.url);} catch {return false;}
  if(url.protocol!=="https:"||url.username||url.password||
    !url.hostname||url.hostname==="localhost")return false;
  const governmentHost=url.hostname.toLowerCase().endsWith(".gov");
  const externallyAttested=source.officialAuthorityVerified===true &&
    typeof source.officialAuthorityVerificationNote==="string" &&
    source.officialAuthorityVerificationNote.trim().length>=25;
  return typeof source.authority==="string" &&
    Boolean(source.authority.trim()) &&
    typeof source.checkedAt==="string" &&
    Number.isFinite(Date.parse(source.checkedAt)) &&
    (governmentHost||externallyAttested);
}


const evidenceSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  authority: z.string().min(1),
  checkedAt: z.string().datetime(),
  // Current separately reviewed agency source attribution for non-.gov hosts.
  officialAuthorityVerified:z.boolean().optional(),
  officialAuthorityVerificationNote:z.string().trim().min(25).optional(),
});
/** Optional scoping metadata; absent dimensions require school-specific legal review,
 * never an assumption that every school in a state is covered. */
export const jurisdictionRequirementApplicabilitySchema = z.object({
  states: z.array(z.string().min(2)).min(1),
  localities: z.array(z.string().min(1)).optional(),
  operatingModels: z.array(z.string().min(1)).min(1),
  responsibleEntities: z.array(z.enum(["school_of_record", "host_church"])).min(1),
  programTypes: z.array(z.string().min(1)).optional(),
  gradeLevels: z.array(z.string().min(1)).optional(),
  deliveryModels: z.array(z.enum(["onsite", "online", "hybrid"])).optional(),
  serviceTypes: z.array(z.enum(["academic", "enrichment", "childcare"])).optional(),
}).strict();

export const jurisdictionDisclosureAudiences = [
  "internal_only", "parent_on_request", "authenticated_family",
  "public_required", "public_optional",
] as const;
const requirementSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  responsibleParty: z.enum(["can","church","family"]),
  phase: z.enum(["before_opening","before_enrollment","follow_up"]),
  evidenceIds: z.array(z.string()).default([]),
  category: z.enum(["authorization", "academic", "safety", "staffing", "facilities", "finance", "records", "other"]).optional(),
  applicability: jurisdictionRequirementApplicabilitySchema.optional(),
  disclosureAudience: z.enum(jurisdictionDisclosureAudiences).default("internal_only"),
  effectiveOn: z.string().date().optional(),
  reviewBy: z.string().date().optional(),
  /** Date-only legal filing/renewal dates are informational until verified
   * in this immutable, independently reviewed profile version. */
  filingDeadline: z.string().date().optional(),
  renewalDeadline: z.string().date().optional(),
});
export const jurisdictionProfileSchema = z.object({
  summary: z.string().min(1),
  operatingModels: z.array(z.string()).default([]),
  fundingPrograms: z.array(z.object({
    id: z.string().min(1), name: z.string().min(1),
    summary: z.string().min(1),
    eligibilityStatus: z.enum(["verified","conditional","under_review","unknown"]),
    evidenceIds: z.array(z.string()).default([]),
    applicationDeadline: z.string().date().optional(),
    renewalDeadline: z.string().date().optional(),
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

export function isJurisdictionProfileVerificationEvidenceCurrent(
  verificationEvidence: unknown,
  sources: unknown,
): verificationEvidence is {note:string;sources:Array<{title:string;url:string;authority:string;checkedAt:string}>} {
  if(!verificationEvidence||typeof verificationEvidence!=="object"||!Array.isArray(sources))return false;
  const evidence=verificationEvidence as {note?:unknown;sources?:unknown};
  if(typeof evidence.note!=="string"||evidence.note.trim().length<25||!Array.isArray(evidence.sources)||
     evidence.sources.length!==sources.length)return false;
  return evidence.sources.every((item,index)=>{
    const source=sources[index];
    if(!item||typeof item!=="object"||!source||typeof source!=="object")return false;
    const attested=item as Record<string,unknown>;
    const current=source as Record<string,unknown>;
    return ["title","url","authority","checkedAt",
      "officialAuthorityVerified","officialAuthorityVerificationNote"].every(key=>
      attested[key]===current[key]) && isOfficialJurisdictionSource(
        current as {url:string;authority:string;checkedAt:string;
          officialAuthorityVerified?:boolean;officialAuthorityVerificationNote?:string});
  });
}

/** Public/setup projection of canonical state policy. Never duplicates launch state. */
export function schoolLaunchJurisdictionSummary(profile: JurisdictionProfile) {
  return {
    summary: profile.summary,
    operatingModels: profile.operatingModels,
    fundingPrograms: profile.fundingPrograms.map(({id,name,summary,eligibilityStatus})=>({id,name,summary,eligibilityStatus})),
    actions: profile.requirements.map(({id,title,description,responsibleParty,phase})=>({id,title,description,responsibleParty,phase})),
  };
}

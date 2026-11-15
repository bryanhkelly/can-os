import { z } from "zod";
import { createHash } from "node:crypto";

export const noncreditEnrollCommand = z.object({
  releaseId:z.string().uuid(),
  consentVersion:z.string().min(3).max(80),
  consentSha256:z.string().regex(/^[a-f0-9]{64}$/),
  acceptedConsent:z.literal(true),
  adultConfirmed:z.literal(true),
  referralCode:z.string().trim().max(64).regex(/^[a-zA-Z0-9_-]*$/).optional(),
}).strict();

export const noncreditPublishCommand = z.object({
  deploymentId:z.string().uuid(),
  adoptionId:z.string().uuid(),
  trainingVersionId:z.string().uuid(),
  courseVersionId:z.string().uuid(),
  deliveryMode:z.enum(["independent","facilitated"]),
  siteId:z.string().uuid().nullable(),
  opensAt:z.string().datetime({offset:true}),
  closesAt:z.string().datetime({offset:true}),
  maxParticipants:z.number().int().min(1).max(1000000),
  consentVersion:z.string().trim().min(3).max(80),
  consentText:z.string().trim().min(25).max(4000),
}).strict().refine(x=>new Date(x.opensAt)<new Date(x.closesAt),{message:"Enrollment close must follow opening"})
  .refine(x=>(x.deliveryMode==="independent"&&x.siteId===null)||
   (x.deliveryMode==="facilitated"&&x.siteId!==null),{message:"Facilitated registration requires a Site"});

/** Consent is bound to the exact server published text and revision, not a
 * mutable browser/localStorage copy. */
export function publishedNoncreditConsentHash(consentVersion:string,consentText:string) {
  return createHash("sha256").update(consentVersion+"\n"+consentText).digest("hex");
}
export function assertCanSelfEnroll(input:{
  isAuthenticated:boolean; emailVerified:boolean; demoSwitching:boolean;
  distinctPersonCount:number; isStudent:boolean; consentMatches:boolean;
  adultConfirmed:boolean; published:boolean; activeDeployment:boolean;
  activeOperation:boolean; approvedAdoption:boolean; publishedCourse:boolean;
  publishedOffering:boolean; publishedTraining:boolean; approvedTraining:boolean;
  currentPolicy:boolean; remainingSeats:number;
}) {
  if(!input.isAuthenticated||!input.emailVerified||input.demoSwitching||
    input.distinctPersonCount!==1||input.isStudent)
    throw new Error("A verified, unambiguous adult CAN account is required");
  if(!input.consentMatches||!input.adultConfirmed)throw new Error("Current terms must be accepted");
  if(!input.published||!input.activeDeployment||!input.activeOperation||
    !input.approvedAdoption||!input.publishedCourse||!input.publishedOffering||
    !input.publishedTraining||!input.approvedTraining||!input.currentPolicy)
    throw new Error("This training is not currently open for self-enrollment");
  if(input.remainingSeats<=0)throw new Error("This registration has reached capacity");
}


/** Course withdrawal must not erase a finalized noncredit outcome.
 * An already-withdrawn registration is idempotent, not a new transition. */
export function noncreditSelfWithdrawalDecision(input:{
  registrationStatus:"registered"|"active"|"completed"|"withdrawn"|"cancelled";
  hasCompletedAttempt:boolean;
  hasCompletedDecision:boolean;
}):"withdraw"|"already_withdrawn"|"deny" {
  if(input.registrationStatus==="withdrawn")return "already_withdrawn";
  if(input.registrationStatus!=="registered"&&input.registrationStatus!=="active")
    return "deny";
  if(input.hasCompletedAttempt||input.hasCompletedDecision)return "deny";
  return "withdraw";
}

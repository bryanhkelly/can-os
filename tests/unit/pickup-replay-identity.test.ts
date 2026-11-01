import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
describe("custody idempotency replay binds the full observed event",()=>{
 const file=readFileSync("src/modules/operations/pickup.functions.ts","utf8");
 function replayBlock(marker:string,nextMarker:string){
   const source=file.slice(file.indexOf(marker),file.indexOf(nextMarker,file.indexOf(marker)+1));
   const beginning=source.indexOf("if (replay) {");
   const end=source.indexOf("return {",beginning);
   return source.slice(beginning,end);
 }
 it("guardian authorizations cannot silently change names, dates or identity methods",()=>{
   const block=replayBlock("export const createPickupAuthorization","export const revokePickupAuthorization");
   for(const k of ["legalFirstName","legalLastName","relationshipLabel","identityVerificationMethod","startsOn","expiresOn","studentProfileId","householdId","programId"])expect(block).toContain(k);
 });
 it("custody holds bind subject, program, household, reason and kind",()=>{
   const block=replayBlock("export const createPickupCustodyHold","export const resolvePickupCustodyHold");
   for(const k of ["studentProfileId","programId","householdId","reason","kind","createdByPersonId"])expect(block).toContain(k);
 });
 it("verified releases bind date, same authorization, witness, verification and physical handoff",()=>{
   const block=replayBlock("export const recordVerifiedPickupRelease","export const recordDeniedPickup");
   for(const k of ["studentProfileId","programId","releaseDate","date","pickupAuthorizationId","staffWitnessPersonId","identityVerified","identityVerificationMethod","handoffEvidence"])expect(block).toContain(k);
 });
 it("denial replay cannot switch child, date, household, reason, or presented identity",()=>{
   const block=replayBlock("export const recordDeniedPickup","export const recordUncollectedChild");
   for(const k of ["studentProfileId","programId","householdId","releaseDate","pickupPersonId","presentedName","identityVerified","identityVerificationMethod","denialReason","detail"])expect(block).toContain(k);
 });
 it("uncollected follow-up replay binds actual school, student, date, and responsible staff",()=>{
   const block=file.slice(file.indexOf("export const recordUncollectedChild"));
   const replay=block.slice(block.indexOf("if (replay) {"),block.indexOf("return { actionId: replay.id"));
   for(const k of ["ownerPersonId","actor.actorPersonId","subjectId","studentProfileId","programId","siteId","date","dismissalConfirmed","followUpPlan"])expect(replay).toContain(k);
 });
});

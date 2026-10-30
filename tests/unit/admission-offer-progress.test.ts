import { describe,expect,it } from "vitest";
import { admissionOfferProgress } from "@/domain/admission-offer-progress";
const now=new Date("2030-01-01T00:00:00.000Z");
const base={status:"issued",expiresAt:"2030-02-01T00:00:00.000Z",journeyStatus:"ready",
 blockers:0,enrollmentActive:false,sectionCount:0};
describe("admissions next steps",()=>{
 it("distinguishes acceptance, activation and class placement",()=>{
  expect(admissionOfferProgress(base,now)).toMatchObject({state:"awaiting_response",canAccept:true});
  expect(admissionOfferProgress({...base,status:"accepted"},now)).toMatchObject({state:"awaiting_activation",canAccept:false});
  expect(admissionOfferProgress({...base,status:"accepted",enrollmentActive:true},now)).toMatchObject({state:"awaiting_classes",canAccept:false});
  expect(admissionOfferProgress({...base,status:"accepted",enrollmentActive:true,sectionCount:2},now)).toMatchObject({state:"enrolled",canAccept:false});
 });
 it("blocks acceptance for incomplete or missing readiness configuration",()=>{
  for(const state of [{...base,blockers:1},{...base,journeyStatus:null},{...base,journeyStatus:"in_progress"}])
   expect(admissionOfferProgress(state,now)).toMatchObject({state:"requirements_pending",canAccept:false});
  expect(admissionOfferProgress({...base,status:"accepted",blockers:1},now).message).toContain("acceptance is recorded");
 });
 it("expires at the exact instant without treating accepted offers as expired",()=>{
  expect(admissionOfferProgress({...base,expiresAt:now.toISOString()},now)).toMatchObject({state:"expired",canAccept:false});
  expect(admissionOfferProgress({...base,status:"accepted",expiresAt:now.toISOString()},now).state).toBe("awaiting_activation");
 });
 it("never offers acceptance of declined, revoked or draft offers",()=>{
  for(const status of ["declined","revoked","expired","draft"])
   expect(admissionOfferProgress({...base,status},now).canAccept).toBe(false);
  expect(admissionOfferProgress({...base,status:"revoked"},now).message).toContain("withdrawn");
  expect(admissionOfferProgress({...base,status:"revoked",enrollmentActive:true,sectionCount:1},now).state).toBe("revoked");
 });
 it("explains closed and waitlisted applications without offering acceptance",()=>{
  for(const applicationStage of ["withdrawn","declined","inquiry","lead"])
   expect(admissionOfferProgress({...base,applicationStage},now))
    .toMatchObject({state:"application_unavailable",canAccept:false});
  expect(admissionOfferProgress({...base,waitlisted:true},now))
   .toMatchObject({state:"application_unavailable",canAccept:false});
  expect(admissionOfferProgress({...base,applicationStage:"eligibility",waitlisted:false},now).canAccept).toBe(true);
 });
});

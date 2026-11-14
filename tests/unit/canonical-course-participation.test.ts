import { describe, expect, it } from "vitest";
import { resolveCanonicalCourseParticipation } from "@/domain/canonical-course-participation";

const now = new Date("2026-11-14T12:00:00Z");
const attempt = {id:"attempt", enrollmentId:null, noncreditRegistrationId:"registration",deploymentId:"deployment",adoptionId:"adoption",offeringVersionId:"offering",courseVersionId:"course",sectionId:null,status:"active" as const};
const authority = {deploymentId:"deployment",deploymentStatus:"active" as const,adoptionId:"adoption",adoptionStatus:"approved" as const,adoptionValidFrom:new Date("2026-11-01"),adoptionValidThrough:null,coursePublished:true,offeringPublished:true};
const registration = {id:"registration",deploymentId:"deployment",adoptionId:"adoption",offeringVersionId:"offering",participantPersonId:"adult",learnerId:null,trainingVersionId:"training",status:"registered" as const};
const training = {id:"training",offeringVersionId:"offering",state:"published" as const};
const noncredit = {actorPersonId:"adult",attempt,registration,training,authority,now};

describe("canonical course participation",()=>{
 it("authorizes an adult without school Section or learner profile",()=>{
   expect(resolveCanonicalCourseParticipation(noncredit)).toMatchObject({source:"noncredit",courseAttemptId:"attempt",sectionId:null,noncreditRegistrationId:"registration"});
 });
 it("requires the exact participant, registration and adoption",()=>{
   expect(()=>resolveCanonicalCourseParticipation({...noncredit,actorPersonId:"unrelated"})).toThrow();
   expect(()=>resolveCanonicalCourseParticipation({...noncredit,registration:{...registration,adoptionId:"different"}})).toThrow();
   expect(()=>resolveCanonicalCourseParticipation({...noncredit,attempt:{...attempt,sectionId:"fake"}})).toThrow();
 });
 it("blocks withdrawn accounts, unreleased training, suspended deployments and expired adoptions",()=>{
   expect(()=>resolveCanonicalCourseParticipation({...noncredit,registration:{...registration,status:"withdrawn"}})).toThrow();
   expect(()=>resolveCanonicalCourseParticipation({...noncredit,training:{...training,state:"draft"}})).toThrow();
   expect(()=>resolveCanonicalCourseParticipation({...noncredit,authority:{...authority,deploymentStatus:"suspended"}})).toThrow();
   expect(()=>resolveCanonicalCourseParticipation({...noncredit,authority:{...authority,adoptionValidThrough:new Date("2026-11-10")}})).toThrow();
 });
 it("keeps school enrollment a separate approved source",()=>{
   const schoolAttempt={...attempt,enrollmentId:"enrollment",noncreditRegistrationId:null,sectionId:"section"};
   const school={...noncredit,attempt:schoolAttempt,registration:null,training:null,enrollment:{id:"enrollment",deploymentId:"deployment",learnerPersonId:"adult",status:"active" as const}};
   expect(resolveCanonicalCourseParticipation(school)).toMatchObject({source:"school",sectionId:"section"});
   expect(()=>resolveCanonicalCourseParticipation({...school,enrollment:{...school.enrollment,learnerPersonId:"another"}})).toThrow();
 });
 it("treats completed status as read-only history when requested",()=>{
   const past={...noncredit,attempt:{...attempt,status:"completed" as const},registration:{...registration,status:"completed" as const}};
   expect(()=>resolveCanonicalCourseParticipation(past)).toThrow();
   expect(resolveCanonicalCourseParticipation({...past,allowCompletedHistory:true}).source).toBe("noncredit");
 });
});

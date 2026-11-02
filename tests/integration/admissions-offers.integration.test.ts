import {describe,expect,it,vi} from "vitest";
import type { Actor } from "@/modules/identity/actors.server";
const state=vi.hoisted(()=>({actor:undefined as Actor|undefined}));
vi.mock("@/modules/identity/command-context.server",()=>({
 getCommandContext:async()=>{if(!state.actor)throw new Error("Missing admissions race actor");return state.actor;},
}));
vi.mock("@tanstack/react-start/server",()=>({getRequest:()=>new Request("http://localhost")}));
vi.mock("@tanstack/react-start",()=>({
 createServerFn:()=>({
  parse:(value:unknown)=>value,
  validator(parse:(value:unknown)=>unknown){this.parse=parse;return this;},
  handler(callback:(input:{data:unknown})=>unknown){
   return async(input?:{data:unknown})=>callback({data:this.parse(input?.data)});
  },
 }),
}));
/** Explicit opt-in only. Never write integration fixtures to a production DB automatically. */
const integration=process.env.DATABASE_URL&&process.env.CAN_TEST_DB_WRITES_ENABLED==="true"&&process.env.APP_ENV==="test"&&process.env.NODE_ENV==="test"?describe:describe.skip;
integration("synthetic admissions offer concurrency",()=>{
 it("only one offer takes the final seat and accepted offer activates once",async()=>{
  if(process.env.CAN_TEST_DB_WRITES_ENABLED!=="true"||process.env.APP_ENV!=="test"||process.env.NODE_ENV!=="test")throw new Error("Disposable Neon test guard required");
  const [{db},s,{eq},svc,{startFamilyApplication}]=await Promise.all([
   import("@/db/client"),import("@/db/schema"),import("drizzle-orm"),
   import("@/modules/enrollment/admissions-offer-service"),import("@/modules/enrollment/enrollment-service")
  ]);
  const {createAcademicTimeFixture}=await import("./helpers/academic-time");
  const suffix=crypto.randomUUID().slice(0,8);
  const [jurisdiction]=await db.insert(s.jurisdictions).values({code:`offer-${suffix}`,name:"Synthetic admissions jurisdiction"}).returning();
  const [school]=await db.insert(s.organizations).values({type:"church",name:`Synthetic Host ${suffix}`,slug:`offer-host-${suffix}`}).returning();
  const [network]=await db.insert(s.organizations).values({type:"can_network",name:`Synthetic CAN ${suffix}`,slug:`offer-can-${suffix}`}).returning();
  const [site]=await db.insert(s.sites).values({organizationId:school.id,name:"Synthetic Campus",slug:`offer-campus-${suffix}`}).returning();
  const [program]=await db.insert(s.programs).values({organizationId:school.id,siteId:site.id,jurisdictionId:jurisdiction.id,type:"church_hosted_academy",status:"active",name:"Synthetic Academy",slug:`offer-academy-${suffix}`,gradeRange:{min:"6",max:"12"},deliveryModel:{onsite:true},hostOrganizationId:school.id,academicProviderOrganizationId:network.id,creditIssuingOrganizationId:network.id,metadata:{synthetic:true}}).returning();
  const calendar=await createAcademicTimeFixture({organizationId:school.id,programId:program.id,siteId:site.id,suffix});
  await db.insert(s.admissionSeatPools).values({programId:program.id,schoolYearId:calendar.schoolYear.id,capacity:1});
  const journeyKey=`synthetic-offers-${suffix}`;
  await db.insert(s.journeyDefinitions).values({key:journeyKey,version:"1",owningOrganizationId:network.id,audience:"family",title:"Synthetic Admissions",configuration:{requirements:[]}});
  const [guardian]=await db.insert(s.people).values({legalFirstName:"Synthetic",legalLastName:"Guardian"}).returning();
  const [registrarPerson]=await db.insert(s.people).values({legalFirstName:"Synthetic",legalLastName:"Registrar"}).returning();
  const registrar={actorPersonId:registrarPerson.id,role:"registrar",capabilities:new Set(["enrollment.decide","enrollment.activate"]),scope:{programIds:[program.id]}};
  const family={actorPersonId:guardian.id,role:"guardian",capabilities:new Set(["enrollment.apply"]),scope:{programIds:[program.id]}};
  const records=[];
  let sharedHouseholdId: string | undefined;
  for(let i=0;i<2;i++){
   const row=await startFamilyApplication(family,{programId:program.id,householdId:sharedHouseholdId,idempotencyKey:`offer-family-${suffix}-${i}`,journeyDefinitionKey:journeyKey,student:{legalFirstName:`Synthetic${i}`,legalLastName:"Student",gradeLevel:"9"}});
   sharedHouseholdId=row.householdId;
   await db.update(s.applications).set({metadata:{synthetic:true}}).where(eq(s.applications.id,row.applicationId));
   await db.update(s.journeys).set({status:"ready"}).where(eq(s.journeys.id,row.journeyId));
   records.push(row);
  }
  // The child relationship created by application intake is prospective.
  // Model a separate verified school review before exercising real offer
  // acceptance and activation in this synthetic integration fixture.
  await db.update(s.guardianRelationships).set({
    canViewAcademics:true,canManageEnrollment:true,canSubmitAttendanceExcuse:true,
    metadata:{verification:"verified",source:"synthetic_independent_review"},
  }).where(eq(s.guardianRelationships.guardianPersonId,guardian.id));
  expect(new Set(records.map(r=>r.householdId)).size).toBe(1);
  expect(new Set(records.map(r=>r.studentProfileId)).size).toBe(2);
  const [outsider]=await db.insert(s.people).values({legalFirstName:"Synthetic",legalLastName:"Outsider"}).returning();
  const outsiderContext={actorPersonId:outsider.id,capabilities:new Set(["enrollment.apply"]),scope:{programIds:[program.id]}};
  await expect(startFamilyApplication(outsiderContext,{
   programId:program.id,householdId:sharedHouseholdId,
   idempotencyKey:`outsider-family-${suffix}`,journeyDefinitionKey:journeyKey,
   student:{legalFirstName:"Unauthorized",legalLastName:"Student",gradeLevel:"9"}
  })).rejects.toThrow("Guardian is not a member of the supplied Household");
  const householdApplications=await db.select().from(s.applications).where(eq(s.applications.householdId,sharedHouseholdId!));
  expect(householdApplications).toHaveLength(2);
  // Previously submitted idempotency keys must not bypass a revoked program grant.
  const revokedFamily={...family,scope:{programIds:[]}};
  await expect(startFamilyApplication(revokedFamily,{
   programId:program.id,householdId:sharedHouseholdId,
   idempotencyKey:`offer-family-${suffix}-0`,journeyDefinitionKey:journeyKey,
   student:{legalFirstName:"Synthetic0",legalLastName:"Student",gradeLevel:"9"}
  })).rejects.toThrow("program scope");
  expect(await db.select().from(s.applications).where(eq(s.applications.householdId,sharedHouseholdId!))).toHaveLength(2);
  const expiry=new Date(Date.now()+7*24*60*60*1000);
  // First verify that a declined offer actually releases the sole seat for a sibling.
  const wrongProgramRegistrar={actorPersonId:registrarPerson.id,role:"registrar",capabilities:new Set(["enrollment.decide"]),scope:{programIds:[crypto.randomUUID()]}};
  await expect(svc.issueAdmissionOfferCommand(wrongProgramRegistrar,{
   applicationId:records[0]!.applicationId,schoolYearId:calendar.schoolYear.id,
   idempotencyKey:`unauthorized-program-${suffix}`,expiresAt:expiry
  })).rejects.toThrow(/program scope|Missing required capability or scope/);
  const beforeIssuance=await db.select().from(s.admissionOffers).where(eq(s.admissionOffers.schoolYearId,calendar.schoolYear.id));
  expect(beforeIssuance).toHaveLength(0);
  const temporaryOffer=await svc.issueAdmissionOfferCommand(registrar,{
   applicationId:records[0]!.applicationId,schoolYearId:calendar.schoolYear.id,
   idempotencyKey:`temporary-seat-${suffix}`,expiresAt:expiry
  });
  await expect(svc.respondToAdmissionOfferCommand(family,temporaryOffer,"decline")).resolves.toBe(temporaryOffer);
  const [declined]=await db.select().from(s.admissionOffers).where(eq(s.admissionOffers.id,temporaryOffer));
  expect(declined.status).toBe("declined");
  // Retrying the original idempotency key must never resurrect a declined offer.
  await expect(svc.issueAdmissionOfferCommand(registrar,{
   applicationId:records[0]!.applicationId,schoolYearId:calendar.schoolYear.id,
   idempotencyKey:`temporary-seat-${suffix}`,expiresAt:expiry
  })).rejects.toThrow("Existing offer is no longer actionable");
  await expect(svc.respondToAdmissionOfferCommand(family,temporaryOffer,"decline")).resolves.toBe(temporaryOffer);
  const declinedEvents=await db.select().from(s.domainEvents).where(eq(s.domainEvents.aggregateId,temporaryOffer));
  expect(declinedEvents.filter(e=>e.eventType==="AdmissionOfferDeclined")).toHaveLength(1);
  const declinedNotices=await db.select().from(s.notifications).where(eq(s.notifications.recipientPersonId,registrarPerson.id));
  expect(declinedNotices.filter(n=>n.type==="admission_offer_declined"&&n.resourceId===temporaryOffer)).toHaveLength(1);
  // Both children may now compete again; exactly one should obtain the freed seat.
  const settled=await Promise.allSettled(records.map((row,i)=>svc.issueAdmissionOfferCommand(registrar,{applicationId:row.applicationId,schoolYearId:calendar.schoolYear.id,idempotencyKey:`synthetic-seat-${suffix}-${i}`,expiresAt:expiry})));
  const successes=settled.filter(x=>x.status==="fulfilled");
  expect(successes).toHaveLength(1);
  const failures=settled.filter(x=>x.status==="rejected");
  expect(failures).toHaveLength(1);
  const offerId=(successes[0] as PromiseFulfilledResult<string>).value;
  const winnerIndex=settled.findIndex(x=>x.status==="fulfilled");
  const loserIndex=settled.findIndex(x=>x.status==="rejected");
  const [activeOffer]=await db.select().from(s.admissionOffers).where(eq(s.admissionOffers.id,offerId));
  expect(activeOffer.status).toBe("issued");
  // The losing sibling must not receive a held seat, including after a fresh database read.
  const competingOffers=await db.select().from(s.admissionOffers).where(eq(s.admissionOffers.schoolYearId,calendar.schoolYear.id));
  expect(competingOffers.filter(o=>o.status==="issued"||o.status==="accepted")).toHaveLength(1);
  await expect(svc.issueAdmissionOfferCommand(registrar,{
   applicationId:records[loserIndex]!.applicationId,schoolYearId:calendar.schoolYear.id,
   idempotencyKey:`synthetic-seat-retry-${suffix}`,expiresAt:expiry
  })).rejects.toThrow("Seat pool is full");
  const guardianNotices=await db.select().from(s.notifications).where(eq(s.notifications.recipientPersonId,guardian.id));
  expect(guardianNotices.filter(n=>n.type==="admission_offer_issued"&&n.resourceId===offerId)).toHaveLength(1);

  // A person with the guardian capability but without the student relationship must be denied.
  const unrelatedGuardian={actorPersonId:registrarPerson.id,role:"guardian",capabilities:new Set(["enrollment.apply"]),scope:{programIds:[program.id]}};
  await expect(svc.respondToAdmissionOfferCommand(unrelatedGuardian,offerId,"accept")).rejects.toThrow("Guardian is not authorized");
  const [beforeDecision]=await db.select().from(s.admissionOffers).where(eq(s.admissionOffers.id,offerId));
  expect(beforeDecision.status).toBe("issued");
  // Enrollment activation is forbidden before the actual guardian has accepted.
  await expect(svc.activateOfferedEnrollmentCommand(registrar,offerId)).rejects.toThrow("Guardian must accept offer first");

  await expect(svc.respondToAdmissionOfferCommand(family,offerId,"accept")).resolves.toBe(offerId);
  const registrarNotices=await db.select().from(s.notifications).where(eq(s.notifications.recipientPersonId,registrarPerson.id));
  expect(registrarNotices.filter(n=>n.type==="admission_offer_accepted"&&n.resourceId===offerId)).toHaveLength(1);
  await expect(svc.respondToAdmissionOfferCommand(family,offerId,"accept")).resolves.toBe(offerId);
  const decisionNotices=await db.select().from(s.notifications).where(eq(s.notifications.recipientPersonId,registrarPerson.id));
  expect(decisionNotices.filter(n=>n.type==="admission_offer_accepted"&&n.resourceId===offerId)).toHaveLength(1);
  const enrolled=await svc.activateOfferedEnrollmentCommand(registrar,offerId);
  expect(await svc.activateOfferedEnrollmentCommand(registrar,offerId)).toBe(enrolled);
  const actual=await db.select().from(s.enrollments).where(eq(s.enrollments.programId,program.id));
  expect(actual.filter(x=>x.kind==="program"&&x.status==="active")).toHaveLength(1);
  const offerEvents=await db.select().from(s.domainEvents).where(eq(s.domainEvents.aggregateId,offerId));
  expect(offerEvents.map(x=>x.eventType).sort()).toEqual(["AdmissionOfferAccepted","AdmissionOfferIssued"]);
  const activationEvents=await db.select().from(s.domainEvents).where(eq(s.domainEvents.aggregateId,enrolled));
  expect(activationEvents.map(x=>x.eventType)).toEqual(["EnrollmentActivated"]);
  const journeyAudits=await db.select().from(s.auditEvents).where(eq(s.auditEvents.resourceId,records[winnerIndex]!.journeyId));
  expect(journeyAudits.filter(x=>x.action==="journey.activate")).toHaveLength(1);
  const confirmationNotices=await db.select().from(s.notifications).where(eq(s.notifications.resourceId,enrolled));
  expect(confirmationNotices.filter(n=>n.type==="enrollment_activated")).toHaveLength(2);
  expect(new Set(confirmationNotices.filter(n=>n.type==="enrollment_activated").map(n=>n.recipientPersonId)).size).toBe(2);
  const finalEnrollments=await db.select().from(s.enrollments).where(eq(s.enrollments.programId,program.id));
  expect(finalEnrollments.filter(x=>x.kind==="program"&&x.status==="active")).toHaveLength(1);
  // Converting a reserved offer into an active enrollment must not open a second seat.
  // A fresh retry against the losing sibling must still be rejected after activation.
  await expect(svc.issueAdmissionOfferCommand(registrar,{
   applicationId:records[loserIndex]!.applicationId,schoolYearId:calendar.schoolYear.id,
   idempotencyKey:`synthetic-after-activation-${suffix}`,expiresAt:expiry
  })).rejects.toThrow("Seat pool is full");
  const persistentOffers=await db.select().from(s.admissionOffers).where(eq(s.admissionOffers.schoolYearId,calendar.schoolYear.id));
  expect(persistentOffers.filter(o=>o.status==="accepted")).toHaveLength(1);
  expect(persistentOffers.filter(o=>o.status==="issued")).toHaveLength(0);

  const {transitionAdmissionsStage}=await import("@/modules/enrollment/admissions-intake.functions");
  state.actor={...registrar,accountId:crypto.randomUUID(),sessionId:crypto.randomUUID(),grantId:crypto.randomUUID(),
   scope:{organizationIds:[school.id],siteIds:[site.id],programIds:[program.id]}};
  await db.update(s.admissionSeatPools).set({capacity:3}).where(eq(s.admissionSeatPools.programId,program.id));
  // Real concurrent transactions: an offer and waitlist decision must never both commit.
  for(let attempt=0;attempt<2;attempt++){
   const racing=await startFamilyApplication(family,{programId:program.id,householdId:sharedHouseholdId,
    idempotencyKey:`race-family-${suffix}-${attempt}`,journeyDefinitionKey:journeyKey,
    student:{legalFirstName:`Race${attempt}`,legalLastName:"Student",gradeLevel:"9"}});
   await db.update(s.applications).set({stage:"eligibility",metadata:{synthetic:true}}).where(eq(s.applications.id,racing.applicationId));
   await db.update(s.journeys).set({status:"ready"}).where(eq(s.journeys.id,racing.journeyId));
   const issue=()=>svc.issueAdmissionOfferCommand(registrar,{applicationId:racing.applicationId,schoolYearId:calendar.schoolYear.id,
    idempotencyKey:`race-offer-${suffix}-${attempt}`,expiresAt:expiry});
   const waitlist=()=>transitionAdmissionsStage({data:{applicationId:racing.applicationId,decision:"waitlist"}});
   const results=await Promise.allSettled(attempt===0?[issue(),waitlist()]:[waitlist(),issue()]);
   expect(results.filter(result=>result.status==="fulfilled")).toHaveLength(1);
   const failure=results.find(result=>result.status==="rejected");
   expect(failure?.status==="rejected"?String(failure.reason):"").toMatch(/Restore the waitlisted|Withdraw each/);
   const [after]=await db.select().from(s.applications).where(eq(s.applications.id,racing.applicationId));
   const issued=await db.select().from(s.admissionOffers).where(eq(s.admissionOffers.applicationId,racing.applicationId));
   if(after.metadata.admissionsDisposition==="waitlisted")expect(issued).toHaveLength(0);
   else{
    expect(issued).toHaveLength(1);
    expect(issued[0].status).toBe("issued");
    await svc.withdrawAdmissionOffer(registrar,{offerId:issued[0].id,reason:"Complete synthetic concurrency acceptance."});
    await transitionAdmissionsStage({data:{applicationId:racing.applicationId,decision:"withdraw"}});
   }
  }
  state.actor=undefined;
 },90000);
});

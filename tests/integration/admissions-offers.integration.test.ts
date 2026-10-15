import {describe,expect,it} from "vitest";
/** Explicit opt-in only. Never write integration fixtures to a production DB automatically. */
const integration=process.env.DATABASE_URL&&process.env.CAN_TEST_DB_WRITES_ENABLED==="true"&&process.env.NODE_ENV!=="production"?describe:describe.skip;
integration("synthetic admissions offer concurrency",()=>{
 it("only one offer takes the final seat and accepted offer activates once",async()=>{
  process.env.CAN_DEMO_WRITES_ENABLED="true";
  const [{db},s,{eq},svc,{startFamilyApplication}]=await Promise.all([
   import("@/db/client"),import("@/db/schema"),import("drizzle-orm"),
   import("@/modules/enrollment/admissions-offer-service"),import("@/modules/enrollment/gf2-service")
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
  const registrar={actorPersonId:guardian.id,capabilities:new Set(["enrollment.decide","enrollment.activate"]),scope:{programIds:[program.id]}};
  const family={actorPersonId:guardian.id,capabilities:new Set(["enrollment.apply"]),scope:{programIds:[program.id]}};
  const records=[];
  for(let i=0;i<2;i++){
   const row=await startFamilyApplication(family,{programId:program.id,idempotencyKey:`offer-family-${suffix}-${i}`,journeyDefinitionKey:journeyKey,student:{legalFirstName:`Synthetic${i}`,legalLastName:"Student",gradeLevel:"9"}});
   await db.update(s.applications).set({metadata:{synthetic:true}}).where(eq(s.applications.id,row.applicationId));
   await db.update(s.journeys).set({status:"ready"}).where(eq(s.journeys.id,row.journeyId));
   records.push(row);
  }
  const expiry=new Date(Date.now()+7*24*60*60*1000);
  const settled=await Promise.allSettled(records.map((row,i)=>svc.issueSyntheticAdmissionOffer(registrar,{applicationId:row.applicationId,schoolYearId:calendar.schoolYear.id,idempotencyKey:`synthetic-seat-${suffix}-${i}`,expiresAt:expiry})));
  const successes=settled.filter(x=>x.status==="fulfilled");
  expect(successes).toHaveLength(1);
  const failures=settled.filter(x=>x.status==="rejected");
  expect(failures).toHaveLength(1);
  const offerId=(successes[0] as PromiseFulfilledResult<string>).value;
  await expect(svc.respondToSyntheticAdmissionOffer(family,offerId,"accept")).resolves.toBe(offerId);
  const enrolled=await svc.activateSyntheticOfferedEnrollment(registrar,offerId);
  expect(await svc.activateSyntheticOfferedEnrollment(registrar,offerId)).toBe(enrolled);
  const actual=await db.select().from(s.enrollments).where(eq(s.enrollments.programId,program.id));
  expect(actual.filter(x=>x.kind==="program"&&x.status==="active")).toHaveLength(1);
 },90000);
});

import {describe,it,expect} from "vitest";
import {and,eq,inArray} from "drizzle-orm";
import {db} from "@/db/client";
import {applications,admissionOffers,admissionSeatPools,enrollments,journeys,journeyRequirements,schoolYears} from "@/db/schema";

/**
 * Run ONLY via scripts/run-integration-tests.mjs using a disposable, isolated
 * TEST_DATABASE_URL. This suite makes no fixture writes; it detects inconsistent
 * canonical enrollment state on the synthetic branch after workflows run.
 */
describe("GF2 persisted synthetic enrollment consistency (Neon)",()=>{
 it("has synthetic admissions fixtures, valid seat pools and no duplicate active program enrollments",async()=>{
  const rows=await db.select({id:applications.id,metadata:applications.metadata,programId:applications.programId,studentProfileId:applications.studentProfileId}).from(applications);
  const synthetic=rows.filter(a=>a.metadata.synthetic===true);
  expect(synthetic.length,"Seed at least one synthetic application on the disposable test branch").toBeGreaterThan(0);
  const appIds=synthetic.map(a=>a.id);
  const offers=await db.select().from(admissionOffers).where(inArray(admissionOffers.applicationId,appIds));
  const active=await db.select({id:enrollments.id,programId:enrollments.programId,schoolYearId:enrollments.schoolYearId,studentProfileId:enrollments.studentProfileId}).from(enrollments).where(and(eq(enrollments.kind,"program"),eq(enrollments.status,"active")));
  const unique=new Set(active.map(e=>[e.programId,e.schoolYearId,e.studentProfileId].join(":")));
  expect(unique.size,"Duplicate active enrollments exist for the same student/program/school year").toBe(active.length);
  const pools=await db.select().from(admissionSeatPools);
  const years=await db.select({id:schoolYears.id,programId:schoolYears.programId}).from(schoolYears);
  for(const offer of offers){
   const app=synthetic.find(a=>a.id===offer.applicationId);
   expect(app?.programId,"Offer must stay with its synthetic application's program").toBe(offer.programId);
   const year=years.find(y=>y.id===offer.schoolYearId);
   expect(year?.programId,"Offer school year must belong to offer program").toBe(offer.programId);
   expect(pools.some(p=>p.programId===offer.programId&&p.schoolYearId===offer.schoolYearId),"Offer requires a seat pool").toBe(true);
   if(offer.status==="accepted"){
    const matching=active.filter(e=>e.programId===offer.programId&&e.schoolYearId===offer.schoolYearId&&e.studentProfileId===app?.studentProfileId);
    expect(matching.length,"Accepted offer can have at most one active enrollment").toBeLessThanOrEqual(1);
   }
  }
  for(const pool of pools){
   expect(pool.capacity,"Seat pool capacity must be positive").toBeGreaterThan(0);
   const enrolled=active.filter(e=>e.programId===pool.programId&&e.schoolYearId===pool.schoolYearId);
   const enrolledStudents=new Set(enrolled.map(e=>e.studentProfileId));
   const held=offers.filter(o=>o.programId===pool.programId&&o.schoolYearId===pool.schoolYearId&&(o.status==="accepted"||(o.status==="issued"&&(!o.expiresAt||o.expiresAt.getTime()>Date.now())))).filter(o=>{
    const a=synthetic.find(a=>a.id===o.applicationId);
    return a&&!enrolledStudents.has(a.studentProfileId);
   });
   expect(enrolledStudents.size+held.length,"Active enrollments plus held offers exceed configured capacity").toBeLessThanOrEqual(pool.capacity);
  }
 });
 it("does not report a ready enrollment journey with incomplete blocking requirements",async()=>{
  const apps=await db.select({id:applications.id,metadata:applications.metadata}).from(applications);
  const ids=apps.filter(a=>a.metadata.synthetic===true).map(a=>a.id);
  expect(ids.length).toBeGreaterThan(0);
  const all=await db.select({id:journeys.id,participantId:journeys.participantId,status:journeys.status}).from(journeys).where(and(eq(journeys.participantType,"application"),inArray(journeys.participantId,ids)));
  for(const j of all.filter(j=>j.status==="ready"||j.status==="active")){
   const blockers=await db.select({status:journeyRequirements.status}).from(journeyRequirements).where(and(eq(journeyRequirements.journeyId,j.id),eq(journeyRequirements.blocking,true)));
   expect(blockers.every(b=>b.status==="complete"),"Ready/active journey has incomplete blocking requirements").toBe(true);
  }
 });
});

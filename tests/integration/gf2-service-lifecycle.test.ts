import {describe,it,expect} from "vitest";
import {and,eq} from "drizzle-orm";
import {db} from "@/db/client";
import {applications,admissionOffers,enrollments,journeys,domainEvents} from "@/db/schema";
import {issueSyntheticAdmissionOffer,respondToSyntheticAdmissionOffer,activateSyntheticOfferedEnrollment} from "@/modules/enrollment/admissions-offer-service";
import type {CommandContext} from "@/domain/command-context";

/** Run only via npm run test:integration on a disposable, already seeded Neon branch. */
const APP="f9000000-0000-4000-8000-000000000003";
const YEAR="f1000000-0000-4000-8000-000000000009";
const PROGRAM="f1000000-0000-4000-8000-000000000004";
const REGISTRAR="f1000000-0000-4000-8000-000000000006";
const GUARDIAN="f3000000-0000-4000-8000-000000000007";
const fixtureKey="gf2-service-e2e-"+APP;
function ctx(actorPersonId:string,capability:string):CommandContext {
 return {actorPersonId,capabilities:new Set([capability]),scope:{programIds:[PROGRAM]},requestId:"gf2-disposable-neon-integration"};
}
describe("GF2 real transactional admissions lifecycle on isolated Neon",()=>{
 it("issues, accepts, activates and retries without duplicate records",async()=>{
  if(process.env.CAN_TEST_DB_WRITES_ENABLED!=="true"||process.env.APP_ENV!=="test")throw new Error("Disposable Neon test guard required");
  const [app]=await db.select().from(applications).where(eq(applications.id,APP)).limit(1);
  expect(app?.metadata.synthetic).toBe(true);
  expect(app?.programId).toBe(PROGRAM);
  const [prior]=await db.select().from(admissionOffers).where(eq(admissionOffers.idempotencyKey,fixtureKey)).limit(1);
  if(!prior){
   expect(app?.stage).toBe("application");
   const [journey]=await db.select().from(journeys).where(and(eq(journeys.participantType,"application"),eq(journeys.participantId,APP))).limit(1);
   expect(journey?.status).toBe("ready");
  }
  const offerId=prior?.id??await issueSyntheticAdmissionOffer(ctx(REGISTRAR,"enrollment.decide"),{
   applicationId:APP,schoolYearId:YEAR,idempotencyKey:fixtureKey,expiresAt:new Date(Date.now()+14*86400000)
  });
  const sameOffer=prior?.id??await issueSyntheticAdmissionOffer(ctx(REGISTRAR,"enrollment.decide"),{
   applicationId:APP,schoolYearId:YEAR,idempotencyKey:fixtureKey,expiresAt:new Date(Date.now()+14*86400000)
  });
  expect(sameOffer).toBe(offerId);
  await respondToSyntheticAdmissionOffer(ctx(GUARDIAN,"enrollment.apply"),offerId,"accept");
  await respondToSyntheticAdmissionOffer(ctx(GUARDIAN,"enrollment.apply"),offerId,"accept");
  const enrollmentId=await activateSyntheticOfferedEnrollment(ctx(REGISTRAR,"enrollment.activate"),offerId);
  expect(await activateSyntheticOfferedEnrollment(ctx(REGISTRAR,"enrollment.activate"),offerId)).toBe(enrollmentId);
  const matches=await db.select().from(enrollments).where(and(eq(enrollments.studentProfileId,app!.studentProfileId),eq(enrollments.programId,PROGRAM),eq(enrollments.schoolYearId,YEAR),eq(enrollments.kind,"program"),eq(enrollments.status,"active")));
  expect(matches).toHaveLength(1);
  const [finalApp]=await db.select().from(applications).where(eq(applications.id,APP)).limit(1);
  expect(finalApp?.stage).toBe("accepted");
  const [journey]=await db.select().from(journeys).where(and(eq(journeys.participantType,"application"),eq(journeys.participantId,APP))).limit(1);
  expect(journey?.status).toBe("active");
  const [offer]=await db.select().from(admissionOffers).where(eq(admissionOffers.id,offerId)).limit(1);
  expect(offer?.status).toBe("accepted");
  const events=await db.select().from(domainEvents).where(and(eq(domainEvents.aggregateType,"enrollment"),eq(domainEvents.aggregateId,enrollmentId)));
  expect(events.filter(e=>e.eventType==="EnrollmentActivated")).toHaveLength(1);
 });
});

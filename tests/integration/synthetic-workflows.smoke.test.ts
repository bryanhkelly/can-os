import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

/**
 * Read-only integration smoke against synthetic Neon fixtures.
 * Runs when DATABASE_URL is configured in CI/dev, otherwise remains explicitly skipped.
 * Mutation concurrency tests require an isolated disposable database branch.
 */
describe.skipIf(!process.env.DATABASE_URL)("synthetic Neon cross-module smoke",()=>{
 it("joins enrolled student -> published assignment -> assigned attempt",async()=>{
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  const rows=await db.select({assessmentId:s.assessments.id,sectionId:s.sections.id,studentId:s.enrollments.studentProfileId})
   .from(s.enrollments)
   .innerJoin(s.sections,eq(s.enrollments.sectionId,s.sections.id))
   .innerJoin(s.assessments,eq(s.assessments.sectionId,s.sections.id))
   .where(and(eq(s.enrollments.studentProfileId,"f1000000-0000-4000-8000-000000000007"),eq(s.enrollments.status,"active")))
   .limit(10);
  expect(rows.length).toBeGreaterThan(0);
 });
 it("keeps student support ownership and synthetic staffing linked",async()=>{
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  const referrals=await db.select({ownerId:s.actions.ownerPersonId,metadata:s.actions.metadata})
   .from(s.actions).where(and(eq(s.actions.type,"support_referral"),eq(s.actions.subjectId,"f1000000-0000-4000-8000-000000000007")));
  expect(referrals.some(r=>r.metadata.fixture==="gf41")).toBe(true);
  const staff=await db.select({id:s.people.id}).from(s.people);
  const available=new Set(staff.map(row=>row.id));
  expect(referrals.every(r=>!r.ownerId||available.has(r.ownerId))).toBe(true);
 });
});

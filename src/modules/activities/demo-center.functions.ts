import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";

/** Bounded, explicitly synthetic Site planning preview. Never return this
 * private-draft projection for arbitrary organizations or Sites, and never
 * mistake Activity Seasons for native Class Enrollment authority. */
export const getDemoCenter=createServerFn({method:"GET"}).handler(async()=>{
  const [{db},s,native]=await Promise.all([
    import("@/db/client"),import("@/db/schema"),import("@/db/canonical-v301"),
  ]);
  const demoSiteId="ca270000-0000-4000-8000-000000000002";
  const [site]=await db.select({
    id:s.sites.id,name:s.sites.name,metadata:s.sites.metadata,
  }).from(s.sites).where(eq(s.sites.id,demoSiteId)).limit(1);
  if(!site||site.metadata.synthetic!==true)return null;
  const plans=await db.select({
    programType:s.programs.type,programName:s.programs.name,
    activityName:s.activities.name,seasonId:s.activitySeasons.id,
    startsOn:s.activitySeasons.startsOn,endsOn:s.activitySeasons.endsOn,
    capacity:s.activitySeasons.capacity,status:s.activitySeasons.status,
  }).from(s.activitySeasons)
    .innerJoin(s.activities,eq(s.activities.id,s.activitySeasons.activityId))
    .innerJoin(s.programs,eq(s.programs.id,s.activities.programId))
    .where(and(eq(s.activities.siteId,demoSiteId),
      eq(s.programs.siteId,demoSiteId),
      eq(s.programs.organizationId, "ca270000-0000-4000-8000-000000000001")));
  // Fixed synthetic Course identity only. Never expose a general publisher
  // draft catalog through a public center preview.
  const [course]=await db.select({
    id:native.courses.id,title:native.courses.title,
    courseCode:native.courses.courseCode,
    versionId:native.courseVersions.id,
    lifecycle:native.courseVersions.lifecycle,
    lessonId:native.courseLessons.id,lessonTitle:native.courseLessons.title,
  }).from(native.courses)
    .innerJoin(native.courseVersions,eq(native.courseVersions.courseId,native.courses.id))
    .leftJoin(native.courseLessons,
      eq(native.courseLessons.courseVersionId,native.courseVersions.id))
    .where(and(
      eq(native.courses.id,"ca270000-0000-4000-8000-000000000041"),
      eq(native.courses.publisherOrganizationId,
        "ca270000-0000-4000-8000-000000000001"),
      eq(native.courseVersions.id,
        "ca270000-0000-4000-8000-000000000042"),
    )).limit(1);
  return {site:{id:site.id,name:site.name},plans,nativeCourse:course??null};
});

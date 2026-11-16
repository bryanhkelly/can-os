import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  offerings, offeringVersions, canonicalOfferingCourses, courseVersions, courses,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Course publisher is distinct from the local Class operator.
 *
 * A national publisher owns the approved Course and its assessment definition;
 * a church or independent Site may administer the published version under its
 * own approved adoption and deployment. Reading publisher identity NEVER
 * grants a publisher authoring role to local staff.
 */
export async function getCanonicalClassPublisher(
  tx:Tx,input:{offeringVersionId:string;courseVersionId:string},
){
  const [owner]=await tx.select({
    publisherOrganizationId:courses.publisherOrganizationId,
  }).from(offeringVersions)
    .innerJoin(offerings,eq(offerings.id,offeringVersions.offeringId))
    .innerJoin(canonicalOfferingCourses,and(
      eq(canonicalOfferingCourses.offeringVersionId,offeringVersions.id),
      eq(canonicalOfferingCourses.courseVersionId,input.courseVersionId),
    ))
    .innerJoin(courseVersions,and(
      eq(courseVersions.id,canonicalOfferingCourses.courseVersionId),
      eq(courseVersions.lifecycle,"published"),
    ))
    .innerJoin(courses,eq(courses.id,courseVersions.courseId))
    .where(and(eq(offeringVersions.id,input.offeringVersionId),
      eq(offeringVersions.lifecycle,"published"),
      eq(offerings.status,"active"))).limit(1);
  if(!owner)throw new AuthorizationError("publisher-owned published Course adopted by Class");
  return owner.publisherOrganizationId;
}

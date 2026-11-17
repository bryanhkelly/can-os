import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { accessAdultLearningReviews, documents } from "@/db/schema";
import { canonicalPersons } from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { verifiedAdultOn } from "@/domain/native-class-enrollment";

/**
 * Independent adult evidence is not a bearer credential. A current, active
 * native session can be rejected if its reviewed eligibility was revoked,
 * its source document expired/revoked, or its Person association diverged.
 *
 * Legacy native accounts with no adult-review record remain governed by
 * their own established issuer and Class admission rules.
 */
export async function assertCurrentReviewedNativeLearner(
  canonicalAccountId:string,canonicalPersonId:string,now=new Date(),
):Promise<void>{
  const [review]=await db.select({
    accessPersonId:accessAdultLearningReviews.accessPersonId,
    personId:accessAdultLearningReviews.canonicalPersonId,
    status:accessAdultLearningReviews.status,
    consumedAt:accessAdultLearningReviews.consumedAt,
    verifiedBirthDate:accessAdultLearningReviews.verifiedBirthDate,
    evidenceReference:accessAdultLearningReviews.evidenceReference,
  }).from(accessAdultLearningReviews).where(
    eq(accessAdultLearningReviews.canonicalAccountId,canonicalAccountId),
  ).limit(2);
  if(!review)return;
  if(review.status!=="approved"||!review.consumedAt||
     review.personId!==canonicalPersonId||
     !verifiedAdultOn(review.verifiedBirthDate,now))
    throw new AuthorizationError("current independently reviewed learner eligibility");
  if(!review.evidenceReference.startsWith("document:"))
    throw new AuthorizationError("approved identity evidence is unavailable");
  const documentId=review.evidenceReference.slice("document:".length);
  const [source]=await db.select({
    subjectId:documents.subjectId,
    category:documents.category,
    verifiedAt:documents.verifiedAt,
    expiresAt:documents.expiresAt,
    metadata:documents.metadata,
  }).from(documents).where(eq(documents.id,documentId)).limit(1);
  if(!source||source.subjectId!==review.accessPersonId||
     source.category!=="adult_identity_verification"||
     !source.verifiedAt||source.verifiedAt>now||
     source.expiresAt!==null&&source.expiresAt<=now||
     source.metadata.revokedAt!=null||
     source.metadata.privateObjectVerified!==true||
     source.metadata.verificationOutcome!=="approved"||
     source.metadata.verifiedBirthDate!==review.verifiedBirthDate)
    throw new AuthorizationError("current independently reviewed adult evidence");
  const [person]=await db.select({birthDate:canonicalPersons.birthDate})
    .from(canonicalPersons).where(eq(canonicalPersons.id,canonicalPersonId)).limit(1);
  if(person?.birthDate!==review.verifiedBirthDate)
    throw new AuthorizationError("current reviewed canonical Person correspondence");
}

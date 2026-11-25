import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { accessAccounts, accountPersonGrants, accessAccountNoncreditPrincipals, accessAdultLearningReviews, documents, people } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { verifiedAdultOn } from "@/domain/native-class-enrollment";

type Reader=Pick<typeof db,"select">;
type Review=typeof accessAdultLearningReviews.$inferSelect;

/** The protected review ledger is the authority for independently verified
 * adulthood; the public Person is the identity authority. Neither a copied
 * birth date in the retired schema nor a learner attestation grants access. */
export async function assertCurrentAdultReviewEvidence(reader:Reader,review:Review,now=new Date()):Promise<void>{
  if(review.status!=="approved"||review.reviewedByAccountId===review.accessAccountId||
     review.reviewedAt>now||!verifiedAdultOn(review.verifiedBirthDate,now))
    throw new AuthorizationError("current independently reviewed learner eligibility");
  const [person]=await reader.select({id:people.id,active:people.active}).from(people)
    .where(eq(people.id,review.accessPersonId)).limit(1);
  const [account]=await reader.select({id:accessAccounts.id}).from(accessAccounts)
    .where(and(eq(accessAccounts.id,review.accessAccountId),eq(accessAccounts.personId,review.accessPersonId),
      eq(accessAccounts.disabled,false),sql`${accessAccounts.emailVerifiedAt} IS NOT NULL`)).limit(1);
  if(!person?.active||!account)throw new AuthorizationError("current authoritative reviewed Person");
  const [reviewer]=await reader.select({id:accountPersonGrants.id}).from(accountPersonGrants)
    .innerJoin(accessAccounts,and(eq(accessAccounts.id,accountPersonGrants.accountId),
      eq(accessAccounts.personId,accountPersonGrants.personId),eq(accessAccounts.disabled,false)))
    .where(and(eq(accessAccounts.id,review.reviewedByAccountId),eq(accountPersonGrants.role,"app_admin"),
      eq(accountPersonGrants.active,true),isNull(accountPersonGrants.organizationId),
      isNull(accountPersonGrants.siteId),sql`${accessAccounts.emailVerifiedAt} IS NOT NULL`,
      sql`${accountPersonGrants.personId} <> ${review.accessPersonId}::uuid`)).limit(1);
  if(!reviewer)throw new AuthorizationError("current independently authorized adult reviewer");
  if(!/^document:[0-9a-f-]{36}$/i.test(review.evidenceReference))
    throw new AuthorizationError("approved identity evidence is unavailable");
  const [source]=await reader.select().from(documents)
    .where(eq(documents.id,review.evidenceReference.slice("document:".length))).limit(1);
  if(!source||source.subjectType!=="person"||source.subjectId!==review.accessPersonId||
     source.category!=="adult_identity_verification"||source.storageProvider!=="cloudflare_r2"||
     !source.storageKey||!["restricted","sensitive","high"].includes(source.sensitivityTier)||
     !source.verifiedAt||source.verifiedAt>now||!source.verifiedByPersonId||
     source.verifiedByPersonId===review.accessPersonId||
     source.expiresAt!==null&&source.expiresAt<=now||
     source.metadata.revokedAt!=null||source.metadata.privateObjectVerified!==true||
     source.metadata.verificationOutcome!=="approved"||
     source.metadata.verifiedBirthDate!==review.verifiedBirthDate)
    throw new AuthorizationError("current independently reviewed adult evidence");
  const [verifier]=await reader.select({id:accountPersonGrants.id}).from(accountPersonGrants)
    .innerJoin(accessAccounts,and(eq(accessAccounts.id,accountPersonGrants.accountId),
      eq(accessAccounts.personId,accountPersonGrants.personId),eq(accessAccounts.disabled,false)))
    .where(and(eq(accountPersonGrants.personId,source.verifiedByPersonId),
      eq(accountPersonGrants.role,"app_admin"),eq(accountPersonGrants.active,true),
      isNull(accountPersonGrants.organizationId),isNull(accountPersonGrants.siteId),
      sql`${accessAccounts.emailVerifiedAt} IS NOT NULL`)).limit(1);
  if(!verifier)throw new AuthorizationError("current independent identity evidence verifier");
}

export async function assertCurrentReviewedNativeLearner(
  canonicalAccountId:string,canonicalPersonId:string,now=new Date(),reader:Reader=db,
  required=false,
):Promise<void>{
  const [review]=await reader.select().from(accessAdultLearningReviews).where(
    eq(accessAdultLearningReviews.canonicalAccountId,canonicalAccountId),
  ).limit(1);
  if(!review){
    if(required)throw new AuthorizationError("independently reviewed adult identity required");
    return;
  }
  if(!review.consumedAt||review.canonicalPersonId!==canonicalPersonId||
     review.accessPersonId!==canonicalPersonId)
    throw new AuthorizationError("current reviewed canonical Person correspondence");
  const [link]=await reader.select().from(accessAccountNoncreditPrincipals).where(and(
    eq(accessAccountNoncreditPrincipals.accessAccountId,review.accessAccountId),
    eq(accessAccountNoncreditPrincipals.accessPersonId,canonicalPersonId),
    eq(accessAccountNoncreditPrincipals.canonicalAccountId,canonicalAccountId),
    eq(accessAccountNoncreditPrincipals.canonicalPersonId,canonicalPersonId),
  )).limit(1);
  if(!link)throw new AuthorizationError("exact reviewed learner identity linkage");
  await assertCurrentAdultReviewEvidence(reader,review,now);
}

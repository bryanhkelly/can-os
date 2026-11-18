import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  accessAccounts, accountPersonGrants, accessAccountNoncreditPrincipals,
  accessAccountCanonicalPrincipals, accessAdultLearningReviews, people, documents,
} from "@/db/schema";
import { canonicalAccounts, canonicalPersons, canonicalEnrollmentOrganizations, canonicalAccountGrants, canonicalSessions } from "@/db/canonical-v301";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { verifiedAdultOn } from "@/domain/native-class-enrollment";
import { isDemoAccountEmail } from "@/domain/local-demo-access";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertUnambiguousAdultAccount } from "@/modules/identity/unambiguous-adult-account.server";
import { writeAudit } from "@/platform/mutation";

/**
 * Explicit independent review by a currently authorized, non-demo App Admin.
 * A reviewer must already have validated the applicant's adulthood and
 * identity from evidence held in a controlled system. The reference below
 * MUST be an opaque evidence ID, never raw identity documents or PII.
 *
 * Deliberately no site-admin, registrar, learner or browser-initiated approval.
 * A submitted review is only an eligibility decision; it does not create a
 * canonical Person, learner grant, native session or Class enrollment.
 */
const reviewInput=z.object({
  accessAccountId:z.string().uuid(),
  organizationId:z.string().uuid(),
  verifiedBirthDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  evidenceReference:z.string().trim().regex(/^document:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
  evidenceIndependentlyChecked:z.literal(true),
}).strict();

export const approveAdultClassLearnerReview=createServerFn({method:"POST"})
 .validator((raw:unknown)=>reviewInput.parse(raw))
 .handler(async({data})=>{
   setResponseHeader("Cache-Control","private, no-store");
   setResponseHeader("Referrer-Policy","no-referrer");
   const actor=await getCommandContext(getRequest());
   assertCapability(actor,"platform.admin");
   if(actor.role!=="app_admin"||!actor.accountId||!actor.actorPersonId||
      actor.sessionAccountId||actor.grantSiteId||
      (actor.scope.organizationIds?.length??0)!==0||
      (actor.scope.siteIds?.length??0)!==0||
      actor.accountId===data.accessAccountId)
     throw new AuthorizationError("independent platform adult identity reviewer");
   const reviewerPersonId=actor.actorPersonId;
   const now=new Date();
   if(!verifiedAdultOn(data.verifiedBirthDate,now))
     throw new AuthorizationError("independently reviewed adult date of birth");
   const result=await db.transaction(async tx=>{
     const [reviewer]=await tx.select({
       email:accessAccounts.emailNormalized,verified:accessAccounts.emailVerifiedAt,
       disabled:accessAccounts.disabled,personId:accessAccounts.personId,
     }).from(accessAccounts).where(eq(accessAccounts.id,actor.accountId)).limit(1);
     if(!reviewer?.verified||reviewer.disabled||
        reviewer.personId!==actor.actorPersonId||isDemoAccountEmail(reviewer.email))
       throw new AuthorizationError("verified App Admin reviewer");
     const [currentAdmin]=await tx.select({id:accountPersonGrants.id})
       .from(accountPersonGrants).where(and(
         eq(accountPersonGrants.id,actor.grantId),
         eq(accountPersonGrants.accountId,actor.accountId),
         eq(accountPersonGrants.personId,reviewerPersonId),
         eq(accountPersonGrants.role,"app_admin"),
         eq(accountPersonGrants.active,true),
         isNull(accountPersonGrants.organizationId),
         isNull(accountPersonGrants.siteId),
       )).limit(1);
     if(!currentAdmin)throw new AuthorizationError("current independent App Admin grant");
     await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"native-identity:"+data.accessAccountId}))`);
     const [account]=await tx.select({
       id:accessAccounts.id,personId:accessAccounts.personId,
       email:accessAccounts.emailNormalized,verified:accessAccounts.emailVerifiedAt,
       disabled:accessAccounts.disabled,
     }).from(accessAccounts)
       .where(eq(accessAccounts.id,data.accessAccountId)).limit(1);
     if(!account?.verified||account.disabled||!account.personId||
        account.personId===actor.actorPersonId||isDemoAccountEmail(account.email))
       throw new AuthorizationError("current verified CAN applicant");
     const [person]=await tx.select({active:people.active})
       .from(people).where(eq(people.id,account.personId)).limit(1);
     if(!person?.active)throw new AuthorizationError("current real applicant Person");
     await assertUnambiguousAdultAccount(account.id,account.personId,tx);
     const [operator]=await tx.select({id:accessAccountCanonicalPrincipals.id})
       .from(accessAccountCanonicalPrincipals).where(and(
         eq(accessAccountCanonicalPrincipals.accountId,account.id),
         isNull(accessAccountCanonicalPrincipals.revokedAt),
       )).limit(1);
     const [link]=await tx.select({
       accountId:accessAccountNoncreditPrincipals.canonicalAccountId,
       personId:accessAccountNoncreditPrincipals.canonicalPersonId,
       accessPersonId:accessAccountNoncreditPrincipals.accessPersonId,
     }).from(accessAccountNoncreditPrincipals).where(
       eq(accessAccountNoncreditPrincipals.accessAccountId,account.id),
     ).limit(1);
     const [native]=await tx.select({
       id:canonicalAccounts.id,
       verified:canonicalAccounts.emailVerifiedAt,
       disabledAt:canonicalAccounts.disabledAt,
     }).from(canonicalAccounts).where(
       eq(canonicalAccounts.emailNormalized,account.email),
     ).limit(1);
     // Reuse an exact, consented noncredit link. An email match by itself,
     // an operator identity, or a different CAN Person never authorizes reuse.
     if(operator||Boolean(native)!==Boolean(link)||
        (link&&(link.accessPersonId!==account.personId||
          link.accountId!==native?.id||!native?.verified||native.disabledAt)))
       throw new AuthorizationError("existing canonical identity requires independent reconciliation");
     if(link){
       const [existingPerson]=await tx.select({
         birthDate:canonicalPersons.birthDate,
       }).from(canonicalPersons).where(eq(canonicalPersons.id,link.personId)).limit(1);
       if(!existingPerson||
          (existingPerson.birthDate!==null&&
           existingPerson.birthDate!==data.verifiedBirthDate))
         throw new AuthorizationError("existing canonical Person requires independently reviewed reconciliation");
     }
     const evidenceId=data.evidenceReference.slice("document:".length);
     const [evidence]=await tx.select({
       subjectType:documents.subjectType,
       subjectId:documents.subjectId,
       category:documents.category,
       storageProvider:documents.storageProvider,
       storageKey:documents.storageKey,
       sensitivity:documents.sensitivityTier,
       verifiedAt:documents.verifiedAt,
       verifiedByPersonId:documents.verifiedByPersonId,
       expiresAt:documents.expiresAt,
       metadata:documents.metadata,
     }).from(documents).where(eq(documents.id,evidenceId)).for("update").limit(1);
     // A browser checkbox or free-text case reference is not independent proof.
     // The referenced protected document must already have been verified by a
     // distinct Person, for this exact CAN Person and reviewed birth date.
     if(!evidence||evidence.subjectType!=="person"||
        evidence.subjectId!==account.personId||
        evidence.category!=="adult_identity_verification"||
        evidence.storageProvider!=="cloudflare_r2"||
        !evidence.storageKey||
        !["restricted","sensitive","high"].includes(evidence.sensitivity)||
        !evidence.verifiedAt||evidence.verifiedAt>now||
        !evidence.verifiedByPersonId||
        evidence.verifiedByPersonId===account.personId||
        evidence.expiresAt!==null&&evidence.expiresAt<=now||
        evidence.metadata.verifiedBirthDate!==data.verifiedBirthDate||
        evidence.metadata.verificationOutcome!=="approved"||
        evidence.metadata.privateObjectVerified!==true||
        evidence.metadata.revokedAt!=null)
       throw new AuthorizationError("independently verified adult identity evidence");
     const [verifierGrant]=await tx.select({id:accountPersonGrants.id})
       .from(accountPersonGrants).innerJoin(accessAccounts,and(
         eq(accessAccounts.id,accountPersonGrants.accountId),
         eq(accessAccounts.disabled,false),
       )).where(and(
         eq(accountPersonGrants.personId,evidence.verifiedByPersonId!),
         eq(accountPersonGrants.role,"app_admin"),
         eq(accountPersonGrants.active,true),
         isNull(accountPersonGrants.organizationId),
         isNull(accountPersonGrants.siteId),
         sql`${accessAccounts.emailVerifiedAt} IS NOT NULL`,
       )).limit(1);
     if(!verifierGrant)
       throw new AuthorizationError("adult identity evidence requires independently authorized verification");
     const [org]=await tx.select({id:canonicalEnrollmentOrganizations.id})
       .from(canonicalEnrollmentOrganizations).where(and(
         eq(canonicalEnrollmentOrganizations.id,data.organizationId),
         eq(canonicalEnrollmentOrganizations.status,"active"),
       )).limit(1);
     if(!org)throw new AuthorizationError("active learner home Organization required");
     const [prior]=await tx.select({status:accessAdultLearningReviews.status})
       .from(accessAdultLearningReviews)
       .where(eq(accessAdultLearningReviews.accessAccountId,account.id))
       .limit(1);
     if(prior)throw new AuthorizationError("previous adult review requires independent reconciliation");
     await tx.insert(accessAdultLearningReviews).values({
       accessAccountId:account.id,accessPersonId:account.personId,
       organizationId:org.id,verifiedBirthDate:data.verifiedBirthDate,
       evidenceReference:data.evidenceReference,
       reviewedByAccountId:actor.accountId,reviewedAt:now,
       status:"approved",
     });
     // Audit contains no DOB or raw evidence. The full review is stored only
     // in the FORCE-RLS evidence ledger; its reference may be resolved under
     // the provider's independent controlled-data access process.
     await writeAudit(tx,actor,{
       action:"class.adult_identity.review_approved",
       entityType:"access_account",entityId:account.id,
       after:{status:"approved",organizationId:org.id},
     });
     return {approved:true as const};
   });
   return result;
 });

/**
 * Revoke an adult-review decision and every native learner credential created
 * from it. The original review, evidence reference, Person and Class history
 * remain intact; no enrollment or assessment source is deleted.
 *
 * This service is essential: changing review status without revoking sessions
 * would leave a previously issued native-only cookie live.
 */
const revokeInput=z.object({
  accessAccountId:z.string().uuid(),
  reason:z.string().trim().min(10).max(500),
}).strict();

export const revokeAdultClassLearnerReview=createServerFn({method:"POST"})
 .validator((raw:unknown)=>revokeInput.parse(raw))
 .handler(async({data})=>{
   setResponseHeader("Cache-Control","private, no-store");
   const actor=await getCommandContext(getRequest());
   assertCapability(actor,"platform.admin");
   if(actor.role!=="app_admin"||!actor.accountId||!actor.actorPersonId||
      actor.sessionAccountId||actor.grantSiteId||
      (actor.scope.organizationIds?.length??0)!==0||
      (actor.scope.siteIds?.length??0)!==0||
      actor.accountId===data.accessAccountId)
     throw new AuthorizationError("independent platform adult identity reviewer");
   const reviewerPersonId=actor.actorPersonId;
   return db.transaction(async tx=>{
     const [reviewer]=await tx.select({
       email:accessAccounts.emailNormalized,verified:accessAccounts.emailVerifiedAt,
       disabled:accessAccounts.disabled,personId:accessAccounts.personId,
     }).from(accessAccounts).where(eq(accessAccounts.id,actor.accountId)).limit(1);
     const [currentAdmin]=await tx.select({id:accountPersonGrants.id})
       .from(accountPersonGrants).where(and(
         eq(accountPersonGrants.id,actor.grantId),
         eq(accountPersonGrants.accountId,actor.accountId),
         eq(accountPersonGrants.personId,reviewerPersonId),
         eq(accountPersonGrants.role,"app_admin"),
         eq(accountPersonGrants.active,true),
         isNull(accountPersonGrants.organizationId),
         isNull(accountPersonGrants.siteId),
       )).limit(1);
     if(!reviewer?.verified||reviewer.disabled||
        reviewer.personId!==actor.actorPersonId||
        isDemoAccountEmail(reviewer.email)||!currentAdmin)
       throw new AuthorizationError("current verified independent reviewer");
     await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"native-identity:"+data.accessAccountId}))`);
     const [review]=await tx.select().from(accessAdultLearningReviews)
       .where(eq(accessAdultLearningReviews.accessAccountId,data.accessAccountId))
       .for("update").limit(1);
     if(!review)throw new AuthorizationError("review record unavailable");
     // Repeated revocation is a reconciliation command: always invalidate
     // dependent credentials, even if the review was previously revoked.
     const alreadyRevoked=review.status==="revoked";
     const now=new Date();
     if(review.canonicalAccountId&&review.canonicalPersonId){
       await tx.update(canonicalAccountGrants).set({
         active:false,revokedAt:now,
       }).where(and(
         eq(canonicalAccountGrants.accountId,review.canonicalAccountId),
         eq(canonicalAccountGrants.personId,review.canonicalPersonId),
         eq(canonicalAccountGrants.roleCode,"learner"),
         eq(canonicalAccountGrants.active,true),
         isNull(canonicalAccountGrants.revokedAt),
       ));
       await tx.update(canonicalSessions).set({revokedAt:now})
         .where(and(
           eq(canonicalSessions.accountId,review.canonicalAccountId),
           isNull(canonicalSessions.revokedAt),
         ));
     }
     if(!alreadyRevoked)await tx.update(accessAdultLearningReviews).set({status:"revoked"})
       .where(eq(accessAdultLearningReviews.accessAccountId,data.accessAccountId));
     await writeAudit(tx,actor,{
       action:"class.adult_identity.review_revoked",
       entityType:"access_account",entityId:data.accessAccountId,
       after:{status:"revoked",reason:data.reason},
     });
     return {revoked:true as const,alreadyRevoked};
   });
 });

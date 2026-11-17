import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  accessAccounts, accountPersonGrants, accessAccountNoncreditPrincipals,
  accessAccountCanonicalPrincipals, accessAdultLearningReviews, people,
} from "@/db/schema";
import { canonicalAccounts, canonicalEnrollmentOrganizations } from "@/db/canonical-v301";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { verifiedAdultOn } from "@/domain/native-class-enrollment";
import { isDemoAccountEmail } from "@/domain/local-demo-access";
import { getCommandContext } from "@/modules/identity/command-context.server";
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
  evidenceReference:z.string().trim().regex(/^[a-z][a-z0-9_-]{1,24}:[a-zA-Z0-9_-]{8,180}$/),
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
         eq(accountPersonGrants.personId,actor.actorPersonId),
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
        isDemoAccountEmail(account.email))
       throw new AuthorizationError("current verified CAN applicant");
     const [person]=await tx.select({active:people.active})
       .from(people).where(eq(people.id,account.personId)).limit(1);
     if(!person?.active)throw new AuthorizationError("current real applicant Person");
     const grants=await tx.select({
       personId:accountPersonGrants.personId,role:accountPersonGrants.role,
     }).from(accountPersonGrants).where(and(
       eq(accountPersonGrants.accountId,account.id),
       eq(accountPersonGrants.active,true),
     )).limit(101);
     if(grants.length===0||grants.length>100||
        grants.some(g=>g.personId!==account.personId||g.role==="student"))
       throw new AuthorizationError("one eligible adult CAN Person");
     const [operator]=await tx.select({id:accessAccountCanonicalPrincipals.id})
       .from(accessAccountCanonicalPrincipals).where(and(
         eq(accessAccountCanonicalPrincipals.accountId,account.id),
         isNull(accessAccountCanonicalPrincipals.revokedAt),
       )).limit(1);
     const [link]=await tx.select({id:accessAccountNoncreditPrincipals.canonicalAccountId})
       .from(accessAccountNoncreditPrincipals).where(
         eq(accessAccountNoncreditPrincipals.accessAccountId,account.id),
       ).limit(1);
     const [native]=await tx.select({id:canonicalAccounts.id})
       .from(canonicalAccounts).where(
         eq(canonicalAccounts.emailNormalized,account.email),
       ).limit(1);
     if(operator||link||native)
       throw new AuthorizationError("existing canonical identity requires independent reconciliation");
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

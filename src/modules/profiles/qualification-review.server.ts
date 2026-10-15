import { eq, desc, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents, domainEvents, memberships, qualificationClaims, qualificationVerificationEvents, roleAssignments, documents } from "@/db/schema";
import { AuthorizationError, type CommandContext } from "@/domain/command-context";
import { decideCredentialReview, type VerificationDecision, type VerificationStatus } from "@/domain/credential-workflow";

/** Database-backed authorization: caller scope alone is never sufficient. */
export async function assertScopedQualificationReviewer(context: CommandContext, subjectPersonId: string) {
  if (!context.actorPersonId || context.actorPersonId === subjectPersonId || !context.capabilities.has("profiles.credentials.verify"))
    throw new AuthorizationError("independent credential reviewer");
  const actorRoles = await db.select().from(roleAssignments).where(eq(roleAssignments.personId, context.actorPersonId));
  const subjectRoles = await db.select().from(roleAssignments).where(eq(roleAssignments.personId, subjectPersonId));
  const actorMemberships = await db.select().from(memberships).where(eq(memberships.personId, context.actorPersonId));
  const subjectMemberships = await db.select().from(memberships).where(eq(memberships.personId, subjectPersonId));
  const authorized=actorRoles.some(a=>{
    if(!a.capabilities.includes("profiles.credentials.verify")) return false;
    if(a.organizationId && !context.scope.organizationIds?.includes(a.organizationId))return false;
    if(a.siteId && !context.scope.siteIds?.includes(a.siteId))return false;
    if(a.programId && !context.scope.programIds?.includes(a.programId))return false;
    if(!a.organizationId && !a.siteId && !a.programId)return false;
    const actorBelongs=Boolean(a.organizationId && actorMemberships.some(m=>m.organizationId===a.organizationId));
    if(!actorBelongs)return false;
    return subjectRoles.some(s=>
      Boolean(a.organizationId && s.organizationId===a.organizationId) ||
      Boolean(a.siteId && s.siteId===a.siteId) ||
      Boolean(a.programId && s.programId===a.programId)
    ) || Boolean(a.organizationId && subjectMemberships.some(m=>m.organizationId===a.organizationId));
  });
  if(!authorized)throw new AuthorizationError("subject affiliation and reviewer scope");
}

/** Append decision, outbox event and audit fact atomically.
 * Caller must already be authenticated, and review access is re-checked on the server.
 */
export async function reviewQualification(
 context:CommandContext,
 input:{claimId:string;decision:VerificationDecision;evidenceDocumentId?:string;reason?:string},
) {
 const [claim]=await db.select().from(qualificationClaims).where(eq(qualificationClaims.id,input.claimId)).limit(1);
 if(!claim)throw new Error("Qualification claim not found");
 await assertScopedQualificationReviewer(context,claim.personId);
 if(!context.actorPersonId)throw new AuthorizationError("authenticated reviewer");
 return db.transaction(async tx=>{
   // Serialize reviews against a claim by locking the parent row.
   await tx.execute(sql`SELECT id FROM qualification_claims WHERE id = ${input.claimId}::uuid FOR UPDATE`);
   const [latest]=await tx.select().from(qualificationVerificationEvents).where(eq(qualificationVerificationEvents.claimId,input.claimId)).orderBy(desc(qualificationVerificationEvents.sequence)).limit(1);
   const current:VerificationStatus=latest?.decision==="approve"?"verified":latest?.decision==="reject"?"rejected":latest?.decision==="revoke"?"revoked":latest?.decision==="submit"?"pending":"unverified";
   const evidenceId=input.evidenceDocumentId??latest?.evidenceDocumentId??null;
   if(evidenceId){
     const [document]=await tx.select({id:documents.id,subjectId:documents.subjectId,subjectType:documents.subjectType}).from(documents).where(eq(documents.id,evidenceId)).limit(1);
     if(!document || document.subjectId!==claim.personId || document.subjectType!=="person")throw new AuthorizationError("credential evidence ownership");
   }
   const decision=decideCredentialReview({status:current,subjectPersonId:claim.personId,evidenceDocumentId:evidenceId,expiry:claim.expiresAt},input.decision,context.actorPersonId!,new Date(),input.reason);
   const [event]=await tx.insert(qualificationVerificationEvents).values({
     claimId:claim.id,sequence:(latest?.sequence??0)+1,decision:input.decision,actorPersonId:context.actorPersonId!,
     evidenceDocumentId:evidenceId,reason:input.reason??null,
   }).returning({id:qualificationVerificationEvents.id});
   await tx.insert(domainEvents).values({eventType:"QualificationVerificationDecided",aggregateType:"QualificationClaim",aggregateId:claim.id,actorPersonId:context.actorPersonId!,payload:{verificationEventId:event.id,decision:input.decision}});
   await tx.insert(auditEvents).values({actorPersonId:context.actorPersonId!,action:"qualification.verification.decided",resourceType:"QualificationClaim",resourceId:claim.id,before:{status:current},after:{status:decision.status,verificationEventId:event.id},context:{requestId:context.requestId??null}});
   return {claimId:claim.id,verificationEventId:event.id,status:decision.status};
 });
}

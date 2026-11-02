import { db } from "@/db/client";
import { documents,memberships,qualificationClaims,qualificationVerificationEvents,roleAssignments } from "@/db/schema";
import { AuthorizationError,type CommandContext } from "@/domain/command-context";
import { credentialStatusFromDecision,decideCredentialReview,type VerificationDecision } from "@/domain/credential-workflow";
import { reviewerCanVerify } from "@/domain/reviewer-authorization";
import { activeRoleAssignmentPredicate } from "@/modules/identity/role-assignment-state.server";
import { emitEvent,writeAudit } from "@/platform/mutation";
import { and,desc,eq } from "drizzle-orm";
import { EventTypes } from "@/domain/event-types";
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Database-backed authorization: caller scope alone is never sufficient. */
type Reader = Pick<typeof db,"select">;
export async function assertScopedQualificationReviewer(context: CommandContext, subjectPersonId: string, executor: Reader = db) {
  if (!context.actorPersonId || context.actorPersonId === subjectPersonId || !context.capabilities.has("profiles.credentials.verify"))
    throw new AuthorizationError("independent credential reviewer");
  const actorRoles = await executor.select().from(roleAssignments).where(and(
    eq(roleAssignments.personId, context.actorPersonId),activeRoleAssignmentPredicate()));
  const subjectRoles = await executor.select().from(roleAssignments).where(and(
    eq(roleAssignments.personId, subjectPersonId),activeRoleAssignmentPredicate()));
  const actorMemberships = await executor.select().from(memberships).where(eq(memberships.personId, context.actorPersonId));
  const subjectMemberships = await executor.select().from(memberships).where(eq(memberships.personId, subjectPersonId));
  const authorized=reviewerCanVerify({context,subjectPersonId,actorRoles,subjectRoles,actorMemberships,subjectMemberships});
  if(!authorized)throw new AuthorizationError("subject affiliation and reviewer scope");
}

/** Append decision, outbox event and audit fact atomically.
 * Caller must already be authenticated, and review access is re-checked on the server.
 */
export async function reviewQualification(
 context:CommandContext,
 input:{claimId:string;decision:VerificationDecision;evidenceDocumentId?:string;reason?:string;expectedSequence?:number},
 transaction?:Transaction,
) {
 const executor=transaction??db;
 const [claim]=await executor.select().from(qualificationClaims).where(eq(qualificationClaims.id,input.claimId)).limit(1);
 if(!claim)throw new Error("Qualification claim not found");
 if(input.decision==="submit") {
   if(context.actorPersonId!==claim.personId || !context.capabilities.has("profiles.credentials.submit")) throw new AuthorizationError("self qualification submission");
 } else await assertScopedQualificationReviewer(context,claim.personId,executor);
 if(!context.actorPersonId)throw new AuthorizationError("authenticated reviewer");
 const append=async(tx:Transaction)=>{
   // Serialize reviews against a claim by locking the parent row.
   const [lockedClaim]=await tx.select().from(qualificationClaims).where(eq(qualificationClaims.id,input.claimId)).for("update").limit(1);
   if(!lockedClaim)throw new Error("Qualification claim not found");
   if(input.decision==="submit"&&context.actorPersonId!==lockedClaim.personId)
     throw new AuthorizationError("self qualification submission");
   if(input.decision!=="submit") await assertScopedQualificationReviewer(context,lockedClaim.personId,tx);
   const [latest]=await tx.select().from(qualificationVerificationEvents).where(eq(qualificationVerificationEvents.claimId,input.claimId)).orderBy(desc(qualificationVerificationEvents.sequence)).limit(1);
   if(input.expectedSequence!==undefined&&input.expectedSequence!==(latest?.sequence??0))
     throw new Error("Qualification review changed. Refresh before deciding.");
   const current=credentialStatusFromDecision(latest?.decision);
   const evidenceId=input.evidenceDocumentId??latest?.evidenceDocumentId??null;
   if(evidenceId){
     const [document]=await tx.select({id:documents.id,subjectId:documents.subjectId,subjectType:documents.subjectType}).from(documents).where(eq(documents.id,evidenceId)).limit(1);
     if(!document || document.subjectId!==lockedClaim.personId || document.subjectType!=="person")throw new AuthorizationError("credential evidence ownership");
   }
   const decision=decideCredentialReview({status:current,subjectPersonId:lockedClaim.personId,evidenceDocumentId:evidenceId,expiry:lockedClaim.expiresAt},input.decision,context.actorPersonId!,new Date(),input.reason);
   const [event]=await tx.insert(qualificationVerificationEvents).values({
     claimId:claim.id,sequence:(latest?.sequence??0)+1,decision:input.decision,actorPersonId:context.actorPersonId!,
     evidenceDocumentId:evidenceId,reason:input.reason??null,
   }).returning({id:qualificationVerificationEvents.id});
   if(!event) throw new Error("Verification event insertion failed");
   await emitEvent(tx,{eventType:EventTypes.QualificationVerificationDecided,aggregateType:"QualificationClaim",aggregateId:claim.id,actorPersonId:context.actorPersonId!,payload:{verificationEventId:event.id,decision:input.decision}});
   await writeAudit(tx,context,{action:"qualification.verification.decided",entityType:"QualificationClaim",entityId:claim.id,before:{status:current},after:{status:decision.status,verificationEventId:event.id}});
   return {claimId:claim.id,verificationEventId:event.id,status:decision.status};
 };
 return transaction?append(transaction):db.transaction(append);
}

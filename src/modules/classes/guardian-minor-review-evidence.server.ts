import {and,eq} from "drizzle-orm";
import type {db} from "@/db/client";
import {applications,documents,journeyRequirements,journeys,studentProfiles} from "@/db/schema";
import {AuthorizationError} from "@/domain/command-context";
import {applicationGuardianContact} from "@/domain/application-guardian-contact";
import {z} from "zod";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
export const minorReviewRecord=z.object({
 applicationId:z.string().uuid(),documentId:z.string().uuid(),
 authorityId:z.string().uuid(),reviewerPersonId:z.string().uuid(),
 verifiedAt:z.string().datetime(),expiresAt:z.string().datetime(),
}).strict();

/** Resolve the previously accepted private enrollment document on this
 * exact child's application. A guardian's upload or arbitrary document ID
 * alone is never proof. Recheck supersession/revocation at every native use. */
export async function requireMinorReviewEvidence(tx:Tx,input:{
 applicationId:string;documentId:string;guardianPersonId:string;learnerPersonId:string;
},now:Date){
 const [row]=await tx.select({
  applicationId:applications.id,metadata:applications.metadata,
  submittedByPersonId:applications.submittedByPersonId,
  studentPersonId:studentProfiles.personId,document:documents,
  requirementStatus:journeyRequirements.status,
 }).from(documents)
 .innerJoin(journeyRequirements,eq(journeyRequirements.id,documents.subjectId))
 .innerJoin(journeys,eq(journeys.id,journeyRequirements.journeyId))
 .innerJoin(applications,eq(applications.id,journeys.participantId))
 .innerJoin(studentProfiles,eq(studentProfiles.id,applications.studentProfileId))
 .where(and(eq(documents.id,input.documentId),eq(documents.subjectType,"journey_requirement"),
  eq(journeys.participantType,"application"),eq(applications.id,input.applicationId)))
 .for("share").limit(1);
 const doc=row?.document;
 if(!row||!doc||row.studentPersonId!==input.learnerPersonId||
    applicationGuardianContact(row.metadata,row.submittedByPersonId)!==input.guardianPersonId||
    row.requirementStatus!=="complete"||doc.category!=="enrollment"||
    doc.storageProvider!=="cloudflare_r2"||!doc.storageKey||
    !["restricted","sensitive","high"].includes(doc.sensitivityTier)||
    doc.metadata.applicationId!==row.applicationId||doc.metadata.storageVerified!==true||
    doc.metadata.reviewStatus!=="accepted"||doc.metadata.isCurrent!==true||
    doc.metadata.revokedAt!=null||!doc.verifiedAt||doc.verifiedAt>now||
    !doc.verifiedByPersonId||[input.guardianPersonId,input.learnerPersonId].includes(doc.verifiedByPersonId)||
    (doc.expiresAt!==null&&doc.expiresAt<=now))
  throw new AuthorizationError("current independently accepted minor enrollment evidence");
 return {verifiedByPersonId:doc.verifiedByPersonId,expiresAt:doc.expiresAt};
}

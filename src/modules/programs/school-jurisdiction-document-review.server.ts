import {and,eq} from "drizzle-orm";
import {db} from "@/db/client";
import {actions,documents,programs,sites} from "@/db/schema";
import type {AccessContext} from "@/domain/access-context";
import {assertCapability,AuthorizationError} from "@/domain/command-context";
import {signPrivateObjectUrl} from "@/platform/storage/r2";
import {readSchoolJurisdictionReview} from "./school-jurisdiction-review.server";
import {jurisdictionDocumentKeyPattern} from "./school-jurisdiction-document-upload.server";

type Reader=Pick<typeof db,"select">;

/** Read-only independent CAN review of a single canonical Program/Action
 * document. All file contents remain private; never send storage keys, raw
 * R2 credentials or signed URLs in a general Action listing. */
export async function readSchoolJurisdictionEvidenceForCAN(
  actor:AccessContext,actionId:string,reader:Reader=db,
){
  if(!actor.actorPersonId||actor.role!=="can_jurisdiction_reviewer"||
    actor.grantSiteId!==null||actor.sessionAccountId)
    throw new AuthorizationError("independent CAN jurisdiction reviewer");
  assertCapability(actor,"jurisdiction.profile.verify");
  const [action]=await reader.select({
    id:actions.id,type:actions.type,status:actions.status,
    subjectId:actions.subjectId,subjectType:actions.subjectType,
    programId:actions.programId,siteId:actions.siteId,
    organizationId:actions.organizationId,metadata:actions.metadata,
    programOrganizationId:programs.organizationId,
    programSiteId:programs.siteId,
    academicProviderId:programs.academicProviderOrganizationId,
  }).from(actions).innerJoin(programs,eq(programs.id,actions.programId))
    .innerJoin(sites,eq(sites.id,programs.siteId))
    .where(eq(actions.id,actionId)).limit(1);
  if(!action||action.type!=="school_jurisdiction_requirement"||
    action.subjectType!=="program"||!action.programId||
    action.subjectId!==action.programId||action.siteId!==action.programSiteId||
    action.organizationId!==action.programOrganizationId||
    !actor.scope.organizationIds?.includes(action.academicProviderId))
    throw new AuthorizationError("CAN's own school-specific legal evidence scope");
  const review=await readSchoolJurisdictionReview(actor,action.programId,reader);
  const documentId=action.metadata.evidenceDocumentId;
  const [doc]=typeof documentId==="string"
    ? await reader.select().from(documents).where(eq(documents.id,documentId)).limit(1)
    : [];
  const current=Boolean(doc && doc.subjectType==="program" &&
    doc.subjectId===action.programId &&
    doc.category==="jurisdiction_requirement_evidence" &&
    doc.storageProvider==="cloudflare_r2" &&
    doc.metadata.storageVerified===true &&
    doc.metadata.isCurrent===true &&
    doc.metadata.actionId===action.id &&
    doc.metadata.siteId===action.siteId &&
    doc.metadata.organizationId===action.organizationId &&
    jurisdictionDocumentKeyPattern.test(doc.storageKey) &&
    doc.storageKey.startsWith("school-jurisdiction/"+action.programId+"/"+action.id+"/") &&
    (!doc.expiresAt||doc.expiresAt>new Date()));
  const scopeCurrent=current && !review.reviewRequired &&
    doc!.metadata.policyVersionId===review.policyVersionId &&
    doc!.metadata.scopeFingerprint===review.scopeFingerprint;
  return {
    actionId:action.id,programId:action.programId,
    status:action.status,
    responsibleParty:action.metadata.responsibleParty,
    scopeCurrent:Boolean(scopeCurrent),
    canIndependentlyVerify:Boolean(scopeCurrent && doc &&
      action.status==="waiting" &&
      doc.metadata.reviewStatus!=="rejected" &&
      doc.uploadedByPersonId!==actor.actorPersonId &&
      action.metadata.submittedByPersonId!==actor.actorPersonId),
    evidence:current && doc?{
      id:doc.id,fileName:doc.fileName,
      version:typeof doc.metadata.version==="number"?doc.metadata.version:1,
      submittedAt:typeof doc.metadata.submittedAt==="string"
        ?doc.metadata.submittedAt:doc.createdAt.toISOString(),
      expiresAt:doc.expiresAt?.toISOString()??null,
      reviewStatus:doc.metadata.reviewStatus==="approved"?"approved":
        doc.metadata.reviewStatus==="rejected"?"rejected":"pending",
      uploadedByPersonId:doc.uploadedByPersonId,
    }:null,
  };
}
export async function getSchoolJurisdictionEvidenceDownloadForCAN(
  actor:AccessContext,input:{actionId:string;documentId:string},
) {
  const current=await readSchoolJurisdictionEvidenceForCAN(actor,input.actionId);
  if(!current.evidence || current.evidence.id!==input.documentId)
    throw new AuthorizationError("current independent reviewer document");
  const [doc]=await db.select({
    storageKey:documents.storageKey,
  }).from(documents).where(eq(documents.id,input.documentId)).limit(1);
  if(!doc||!jurisdictionDocumentKeyPattern.test(doc.storageKey))
    throw new AuthorizationError("private current legal evidence key");
  return {downloadUrl:signPrivateObjectUrl({
    method:"GET",key:doc.storageKey,keyPattern:jurisdictionDocumentKeyPattern,
    expiresSeconds:60,
  }),expiresInSeconds:60};
}

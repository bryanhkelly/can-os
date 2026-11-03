import { createServerFn } from "@tanstack/react-start";
import { getRequest,setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { getCommandContext } from "@/modules/identity/command-context.server";
import {assertCapability,AuthorizationError} from "@/domain/command-context";
import {db} from "@/db/client";
import {actions,documents,organizations,programs,sites} from "@/db/schema";
import {and,eq,inArray} from "drizzle-orm";
import {isJurisdictionRequirementRenewalCurrent} from "@/domain/school-jurisdiction-approval";
import {
  beginSchoolJurisdictionDocumentUpload,finishSchoolJurisdictionDocumentUpload,
} from "./school-jurisdiction-document-upload.server";
import {
  readSchoolJurisdictionEvidenceForCAN,
  getSchoolJurisdictionEvidenceDownloadForCAN,
} from "./school-jurisdiction-document-review.server";
import { readSchoolJurisdictionReview } from "./school-jurisdiction-review.server";
import { ensureSchoolJurisdictionReviewAction, decideSchoolJurisdictionLegalReview } from "./school-jurisdiction-actions.server";
import {submitSchoolJurisdictionRequirementEvidence,
  decideSchoolJurisdictionRequirementEvidence} from "./school-jurisdiction-evidence.server";

/** Internal launch reader; never usable by anonymous Site hosts. */
export const getSchoolJurisdictionReview = createServerFn({method:"GET"})
  .validator((value:unknown) =>
    z.object({programId:z.string().uuid()}).strict().parse(value))
  .handler(async ({data}) => {
    const actor=await getCommandContext(getRequest());
    setResponseHeader("Cache-Control","private, no-store");
    return readSchoolJurisdictionReview(actor,data.programId);
  });

/** Creates an existing Action request for CAN review, never a legal approval. */
export const requestSchoolJurisdictionLegalReview = createServerFn({method:"POST"})
  .validator((value:unknown) =>
    z.object({programId:z.string().uuid()}).strict().parse(value))
  .handler(async ({data})=>{
    const actor=await getCommandContext(getRequest());
    return ensureSchoolJurisdictionReviewAction(actor,data.programId);
  });

/** CAN-only independent decision. The server recomputes the authoritative
 * Site/Program scope and verifies the source version inside a locked transaction. */
export const reviewSchoolJurisdictionLegally = createServerFn({method:"POST"})
  .validator((value:unknown)=>z.object({
    programId:z.string().uuid(),
    expectedScopeFingerprint:z.string().min(10).max(200),
    expectedSiteRevision:z.string().datetime({offset:true}),
    decision:z.enum(["verify","request_changes"]),
    note:z.string().trim().min(25).max(2000),
    sourceUrls:z.array(z.string().url().startsWith("https://")).max(30),
  }).strict().parse(value))
  .handler(async({data})=>{
    const actor=await getCommandContext(getRequest());
    return decideSchoolJurisdictionLegalReview(actor,data);
  });

/** Church registrar submits existing verified-storage Program evidence. */
export const submitSchoolLegalRequirementEvidence=createServerFn({method:"POST"})
  .validator((value:unknown)=>z.object({
    actionId:z.string().uuid(),documentId:z.string().uuid(),
    statement:z.string().trim().min(10).max(4000),
  }).strict().parse(value))
  .handler(async({data})=>{
    const actor=await getCommandContext(getRequest());
    return submitSchoolJurisdictionRequirementEvidence(actor,data);
  });

/** Independent reviewer makes a documentary evidence decision, not a grant
 * of government authority, accreditation or funding participation. */
export const reviewSchoolLegalRequirementEvidence=createServerFn({method:"POST"})
  .validator((value:unknown)=>z.object({
    actionId:z.string().uuid(),
    decision:z.enum(["verify","request_changes"]),
    note:z.string().trim().min(25).max(2000),
  }).strict().parse(value))
  .handler(async({data})=>{
    const actor=await getCommandContext(getRequest());
    return decideSchoolJurisdictionRequirementEvidence(actor,data);
  });

/** Limited work queue for the independent CAN network legal reviewer; the
 * host church Actions remain the canonical work records. No child data. */
export const listCANSchoolJurisdictionReviewQueue=createServerFn({method:"GET"})
  .handler(async()=>{
    const actor=await getCommandContext(getRequest());
    if(!actor.actorPersonId||actor.role!=="can_jurisdiction_reviewer"||
      actor.grantSiteId!==null||actor.sessionAccountId)
      throw new AuthorizationError("independent CAN jurisdiction reviewer");
    assertCapability(actor,"jurisdiction.profile.verify");
    const granted=actor.scope.organizationIds??[];
    if(!granted.length)return {items:[],truncated:false};
    const networks=await db.select({id:organizations.id}).from(organizations)
      .where(and(eq(organizations.type,"can_network"),
        inArray(organizations.id,granted)));
    if(!networks.length)return {items:[],truncated:false};
    const rows=await db.select({
      id:actions.id,type:actions.type,status:actions.status,
      metadata:actions.metadata,
      siteId:sites.id,siteName:sites.name,
      programId:programs.id,programName:programs.name,
    }).from(actions)
      .innerJoin(programs,eq(programs.id,actions.programId))
      .innerJoin(sites,eq(sites.id,programs.siteId))
      .where(and(
        inArray(actions.type,["school_jurisdiction_legal_review",
          "school_jurisdiction_requirement"]),
        inArray(actions.status,["open","waiting","in_progress"]),
        inArray(programs.academicProviderOrganizationId,networks.map(item=>item.id)),
        eq(actions.subjectType,"program"),
        eq(actions.subjectId,programs.id),
        eq(actions.siteId,sites.id),
        eq(actions.organizationId,programs.organizationId),
      )).limit(101);
    setResponseHeader("Cache-Control","private, no-store");
    return {items:rows.slice(0,100).map(row=>({
      id:row.id,type:row.type,status:row.status,
      programId:row.programId,programName:row.programName,
      siteId:row.siteId,siteName:row.siteName,
      requirementId:typeof row.metadata.requirementId==="string"
        ? row.metadata.requirementId:null,
      reviewState:typeof row.metadata.reviewState==="string"
        ? row.metadata.reviewState:"unreviewed",
    })),truncated:rows.length>100};
  });

/** Canonical role-scoped compliance worklist; no duplicate requirement store.
 * A church registrar can see what the school must submit; CAN can see what
 * requires independent documentary review. Family duties remain pending until
 * the owning family-intake integration supplies separately authorized proof.
 */
export const getSchoolJurisdictionRequirementActions=createServerFn({method:"GET"})
  .validator((value:unknown)=>z.object({programId:z.string().uuid()}).strict().parse(value))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCommandContext(getRequest());
    const review=await readSchoolJurisdictionReview(actor,data.programId);
    const [program]=await db.select({organizationId:programs.organizationId})
      .from(programs).where(eq(programs.id,data.programId)).limit(1);
    if(!program)throw new AuthorizationError("canonical legal Program scope");
    const rows=await db.select({
      id:actions.id,status:actions.status,ownerPersonId:actions.ownerPersonId,
      title:actions.title,description:actions.description,
      metadata:actions.metadata,
      updatedAt:actions.updatedAt,
    }).from(actions).where(and(
      eq(actions.type,"school_jurisdiction_requirement"),
      eq(actions.subjectType,"program"),eq(actions.subjectId,data.programId),
      eq(actions.programId,data.programId),eq(actions.siteId,review.siteId),
      eq(actions.organizationId,program.organizationId),
    )).limit(200);
    const candidates=await db.select({
      id:documents.id,fileName:documents.fileName,
      metadata:documents.metadata,
      uploadedByPersonId:documents.uploadedByPersonId,
      expiresAt:documents.expiresAt,
    }).from(documents).where(and(
      eq(documents.subjectType,"program"),
      eq(documents.subjectId,data.programId),
      eq(documents.category,"jurisdiction_requirement_evidence"),
    )).limit(100);
    const evidenceDocuments=candidates.filter(document=>
      document.uploadedByPersonId===actor.actorPersonId &&
      document.metadata.siteId===review.siteId &&
      document.metadata.organizationId===program.organizationId &&
      document.metadata.isCurrent===true &&
      document.metadata.storageVerified===true &&
      (!document.expiresAt || document.expiresAt>new Date()))
      .map(document=>({id:document.id,fileName:document.fileName,
        actionId:typeof document.metadata.actionId==="string"
          ? document.metadata.actionId:null}));
    const eligible=rows.filter(row=>
      row.metadata.scopeFingerprint===review.scopeFingerprint &&
      row.metadata.profileVersionId===review.policyVersionId);
    return {programId:data.programId,reviewRequired:review.reviewRequired,
      evidenceDocuments,items:eligible.map(row=>({
        id:row.id,status:row.status,
        effectiveStatus:row.status==="resolved" &&
          !isJurisdictionRequirementRenewalCurrent(row.metadata)
          ?"renewal_review_required":row.status,
        title:row.title,
        description:row.description,ownerPersonId:row.ownerPersonId,
        requirementId:typeof row.metadata.requirementId==="string"
          ? row.metadata.requirementId:null,
        responsibleParty:row.metadata.responsibleParty==="church"?"church":
          row.metadata.responsibleParty==="can"?"can":"family",
        responsibleRole:typeof row.metadata.responsibleRole==="string"
          ? row.metadata.responsibleRole:null,
        phase:typeof row.metadata.phase==="string"?row.metadata.phase:null,
        reviewState:typeof row.metadata.reviewState==="string"
          ? row.metadata.reviewState:"evidence_needed",
        canSubmitEvidence:!review.reviewRequired &&
          (row.metadata.responsibleParty==="church" &&
            (actor.role==="registrar"||actor.role==="site_admin") ||
           row.metadata.responsibleParty==="can" &&
            actor.role==="can_jurisdiction_reviewer"),
        updatedAt:row.updatedAt.toISOString(),
      }))};
  });

const jurisdictionDocumentUploadInput=z.object({
  actionId:z.string().uuid(),
  expiresAt:z.string().datetime({offset:true}),
  fileName:z.string().trim().min(1).max(150),
  mimeType:z.enum(["application/pdf","image/jpeg","image/png"]),
  size:z.number().int().min(16).max(10*1024*1024),
}).strict();

/** Private jurisdiction requirement upload, scoped to a verified legal Action.
 * Uses existing R2 storage and documents; no second store or opening approval. */
export const beginSchoolJurisdictionDocumentUploadFn=createServerFn({method:"POST"})
  .validator((value:unknown)=>jurisdictionDocumentUploadInput.parse(value))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCommandContext(getRequest());
    return beginSchoolJurisdictionDocumentUpload(actor,data);
  });

export const finishSchoolJurisdictionDocumentUploadFn=createServerFn({method:"POST"})
  .validator((value:unknown)=>jurisdictionDocumentUploadInput.extend({
    key:z.string().regex(/^school-jurisdiction\/[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}$/i),
  }).parse(value))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCommandContext(getRequest());
    return finishSchoolJurisdictionDocumentUpload(actor,data);
  });

/** Actual independently scoped legal proof available only to CAN reviewer,
 * distinct from the anonymous school parent-information projection. */
export const getSchoolJurisdictionEvidenceForCAN=createServerFn({method:"GET"})
  .validator((value:unknown)=>z.object({actionId:z.string().uuid()}).strict().parse(value))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCommandContext(getRequest());
    return readSchoolJurisdictionEvidenceForCAN(actor,data.actionId);
  });
export const getSchoolJurisdictionEvidenceDownloadForCAN=createServerFn({method:"POST"})
  .validator((value:unknown)=>z.object({
    actionId:z.string().uuid(),documentId:z.string().uuid(),
  }).strict().parse(value))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCommandContext(getRequest());
    return getSchoolJurisdictionEvidenceDownloadForCAN(actor,data);
  });

import { createServerFn } from "@tanstack/react-start";
import { getRequest,setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { getCommandContext } from "@/modules/identity/command-context.server";
import {assertCapability,AuthorizationError} from "@/domain/command-context";
import {db} from "@/db/client";
import {actions,organizations,programs,sites} from "@/db/schema";
import {and,eq,inArray} from "drizzle-orm";
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

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { documents } from "@/db/schema";
import { coversLocalSupervisionBlock } from "@/domain/onsite-supervision-coverage";

export const ROOM_COVERAGE_DOCUMENT_CATEGORY = "onsite_block_room_coverage_plan";
export type VerifiedRoomPlan = {
  id:string;
  sectionId:string;
  programId:string;
  periodId:string;
  primaryPersonId:string;
  backupPersonId:string;
  substitutesForPersonId:string|null;
  roomLabel:string;
  roomCapacity:number;
  verifiedAt:Date;
  expiresAt:Date;
};

type Reader=Pick<typeof db,"select">;
type RawDocument=typeof documents.$inferSelect;

/**
 * A room name in Section metadata is NOT an authorized onsite occupancy plan.
 * Require independent verification of a Section+period+date scoped plan with
 * actual distinct named adults and a bounded evidence lifetime. These records
 * remain evidence of a PLAN, not a fire marshal signoff or adult check-in.
 */
export function parseVerifiedRoomPlan(
  doc:Pick<RawDocument,
    "id"|"subjectType"|"subjectId"|"category"|"metadata"|
    "uploadedByPersonId"|"verifiedByPersonId"|"verifiedAt"|"expiresAt">,
  scope:{date:string;siteId:string;programId:string;sectionId:string;
    periodId:string;timeZone:string;startsAtLocal:string;endsAtLocal:string},
):VerifiedRoomPlan|null {
  const m=doc.metadata;
  if(doc.subjectType!=="section" || doc.subjectId!==scope.sectionId ||
     doc.category!==ROOM_COVERAGE_DOCUMENT_CATEGORY ||
     m.isCurrent===false || (m.reviewStatus!==undefined && m.reviewStatus!=="approved") ||
     (m.startsAtLocal!==undefined && m.startsAtLocal!==scope.startsAtLocal) ||
     (m.endsAtLocal!==undefined && m.endsAtLocal!==scope.endsAtLocal) ||
     !doc.verifiedAt || !doc.verifiedByPersonId ||
     doc.uploadedByPersonId===doc.verifiedByPersonId ||
     !doc.expiresAt ||
     !coversLocalSupervisionBlock({
       date:scope.date,timeZone:scope.timeZone,
       startsAtLocal:scope.startsAtLocal,endsAtLocal:scope.endsAtLocal,
       effectiveFrom:doc.verifiedAt,effectiveThrough:doc.expiresAt,
     }) ||
     m.siteId!==scope.siteId || m.programId!==scope.programId ||
     m.sectionId!==scope.sectionId || m.periodId!==scope.periodId ||
     m.date!==scope.date ||
     typeof m.primaryPersonId!=="string" ||
     typeof m.backupPersonId!=="string" ||
     m.primaryPersonId===m.backupPersonId ||
     (m.substitutesForPersonId!=null && (typeof m.substitutesForPersonId!=="string" || m.substitutesForPersonId===m.primaryPersonId)) ||
     typeof m.roomLabel!=="string" || m.roomLabel.trim().length<2 ||
     m.roomLabel.length>120 ||
     typeof m.roomCapacity!=="number" || !Number.isInteger(m.roomCapacity) ||
     m.roomCapacity<1 || m.roomCapacity>1000)
    return null;
  return {
    id:doc.id,sectionId:scope.sectionId,programId:scope.programId,
    periodId:scope.periodId,primaryPersonId:m.primaryPersonId,
    backupPersonId:m.backupPersonId,substitutesForPersonId:typeof m.substitutesForPersonId==="string"?m.substitutesForPersonId:null,roomLabel:m.roomLabel.trim(),
    roomCapacity:m.roomCapacity,verifiedAt:doc.verifiedAt,expiresAt:doc.expiresAt,
  };
}

/** Fetch only Site-matched Section evidence. We validate Program and block
 * identity again before displaying any operational readiness.
 */
export async function fetchRoomPlanEvidence(
  tx:Reader,sectionIds:readonly string[],
):Promise<{rows:RawDocument[];truncated:boolean}>{
  if(!sectionIds.length)return {rows:[],truncated:false};
  const rows=await tx.select().from(documents).where(and(
    eq(documents.subjectType,"section"),
    eq(documents.category,ROOM_COVERAGE_DOCUMENT_CATEGORY),
    inArray(documents.subjectId,[...new Set(sectionIds)]),
    sql`${documents.metadata}->>'isCurrent' IS DISTINCT FROM 'false'`,
  )).orderBy(desc(documents.createdAt),desc(documents.id))
    .limit(2001);
  return {rows:rows.slice(0,2000),truncated:rows.length>2000};
}

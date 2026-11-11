/** A CAN Blueprint approval authorizes a planning scope, never school opening. */
export type BlueprintSubjectKind = "program" | "item";
export type BlueprintReviewState = "verified" | "not_required" | "changes_required";

export type BlueprintEvidenceReview = {
  facility: { status: BlueprintReviewState; documentId?: string | null };
  staffing: { status: BlueprintReviewState; documentId?: string | null };
};
export type BlueprintApprovedDecision = {
  subjectKind: BlueprintSubjectKind;
  subjectId: string;
  decision: "approved" | "changes_required" | "future" | "declined";
  evidence: Record<string, unknown>;
  effectiveFrom?: string | null;
  effectiveThrough?: string | null;
};
type ProposedProgram = {
  id: string; name: string; kind: string; gradeRange: unknown;
  deliveryModel: unknown; catalogVersionId?: string | null;
  religiousAffiliationCode?: string | null;
};
type ProposedItem = {
  id: string; title: string; summary: string; kind: string;
  configuration: unknown; programPlanId?: string | null; catalogVersionId?: string | null;
};
export type ApprovedBlueprintSnapshot = {
  programs?: ProposedProgram[];
  items?: ProposedItem[];
};

export function blueprintOperationalProgramType(kind: string) {
  const mapping = {
    middle_school_6_8:"hosted_academy",
    high_school_9_12:"hosted_academy",
    combined_6_12:"hosted_academy",
    k8_extension:"high_school_extension",
    high_school_extension:"high_school_extension",
    after_school:"after_school_enrichment",
    summer_enrichment:"summer_enrichment",
    summer_academic:"summer_program",
    homeschool_cohort:"homeschool_cohort",
    hybrid_academy:"hybrid_program",
  } as const;
  return Object.prototype.hasOwnProperty.call(mapping,kind)
    ? mapping[kind as keyof typeof mapping] : null;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return "["+value.map(canonical).join(",")+"]";
  if (value && typeof value === "object") {
    return "{"+Object.entries(value).sort(([a],[b])=>a.localeCompare(b))
      .map(([key,item])=>JSON.stringify(key)+":"+canonical(item)).join(",")+"}";
  }
  return JSON.stringify(value) ?? "null";
}
function programReviewShape(p: ProposedProgram) {
  return {name:p.name,kind:p.kind,gradeRange:p.gradeRange,deliveryModel:p.deliveryModel,
    catalogVersionId:p.catalogVersionId??null,
    religiousAffiliationCode:p.religiousAffiliationCode??null};
}
function itemReviewShape(i: ProposedItem) {
  return {title:i.title,summary:i.summary,kind:i.kind,configuration:i.configuration,
    programPlanId:i.programPlanId??null,catalogVersionId:i.catalogVersionId??null};
}
export function validateBlueprintEvidenceReview(evidence: Record<string, unknown>): BlueprintEvidenceReview {
  const result={} as BlueprintEvidenceReview;
  for(const dimension of ["facility","staffing"] as const){
    const value=evidence[dimension];
    if(!value||typeof value!=="object"||Array.isArray(value))
      throw new Error("A CAN reviewer must explicitly assess facility and staffing requirements");
    const entry=value as Record<string,unknown>;
    if(!["verified","not_required","changes_required"].includes(String(entry.status)))
      throw new Error("Facility and staffing reviews must have explicit outcomes");
    const status=entry.status as BlueprintReviewState;
    if(status==="verified" && (typeof entry.documentId!=="string"||!entry.documentId))
      throw new Error("Verified facility and staffing reviews require supporting document evidence");
    result[dimension]={status,documentId:typeof entry.documentId==="string"?entry.documentId:null};
  }
  return result;
}
export function assertBlueprintApprovedForPreparation(input:{
  kind: BlueprintSubjectKind;
  current: ProposedProgram | ProposedItem;
  approvedSnapshot: ApprovedBlueprintSnapshot;
  decision: BlueprintApprovedDecision | undefined;
  now?: string;
}):void {
  const {kind,current,decision}=input;
  const original=kind==="program"
    ?input.approvedSnapshot.programs?.find(p=>p.id===current.id)
    :input.approvedSnapshot.items?.find(p=>p.id===current.id);
  if(!original || !decision || decision.subjectId!==current.id || decision.subjectKind!==kind ||
    decision.decision!=="approved")
    throw new Error("This offering is not in the currently approved CAN Blueprint scope");
  if(canonical(kind==="program"?programReviewShape(original as ProposedProgram):itemReviewShape(original as ProposedItem)) !==
    canonical(kind==="program"?programReviewShape(current as ProposedProgram):itemReviewShape(current as ProposedItem)))
    throw new Error("The approved offering has changed. Submit its revised Blueprint for review");
  const now=input.now??new Date().toISOString().slice(0,10);
  if(decision.effectiveFrom && decision.effectiveFrom>now ||
     decision.effectiveThrough && decision.effectiveThrough<now)
    throw new Error("The CAN-approved offering is outside its effective dates");
  const evidence=validateBlueprintEvidenceReview(decision.evidence);
  if(evidence.facility.status==="changes_required"||evidence.staffing.status==="changes_required")
    throw new Error("Facility or staffing remediation is still required");
  // Preparation only: the resulting Program/Activity still obeys independent
  // operating authorization, school-year, registrations, and publication gates.
}

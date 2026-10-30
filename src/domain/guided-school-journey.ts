import type { summarizeFullFlowOperations } from "./full-flow-operational-snapshot";
import { activeProgramOperationsHref } from "./launch-operations-handoff";

export type SchoolProgramRecord = ReturnType<typeof summarizeFullFlowOperations>["programs"][number];
export type LaunchJourneyRecord = {
  status: string;
  requirements: {status:string;blocking:boolean;title:string}[];
} | null;

/** School-launch guidance is for academic Programs, including independent church hosts.
 * Enrichment has a separate readiness, registration and safeguarding workflow.
 */
export function isGuidedAcademicSchool(type: string): boolean {
  return [
    "church_hosted_academy", "high_school_extension", "full_school",
    "microschool", "hybrid_program", "homeschool_cohort",
  ].includes(type);
}

export type GuidedStep = {
  key: "launch"|"instruction"|"enrollment"|"learning"|"response"|"operations";
  title: string;
  state: "recorded"|"needs_attention"|"review";
  evidence: string;
  nextAction: string;
  href: string;
  suggestedRole: string;
};

/** Read-only navigation based exclusively on persisted workflow evidence.
 * Suggested role is not a permission grant or staff assignment. */
export function guidedSchoolJourney(program: SchoolProgramRecord, journey: LaunchJourneyRecord): GuidedStep[] {
  const c=program.counts;
  const encoded=encodeURIComponent(program.id);
  const site=program.siteId?encodeURIComponent(program.siteId):"";
  const programActive=program.status==="active";
  const operations=programActive?activeProgramOperationsHref({programId:program.id,siteId:program.siteId,status:program.status}):
    `/operations?programId=${encoded}${site?`&siteId=${site}`:""}`;
  const academic=`/operations/launch/${encoded}`;
  const checklist=`/operations/launch?programId=${encoded}${site?`&siteId=${site}`:""}`;
  const blocking=journey?.requirements.filter(r=>r.blocking&&r.status!=="complete")??[];
  const staffed=c.sections>0&&c.publishedSections===c.sections&&c.staffedSections===c.sections;
  // Do not mark enrollment-to-classroom complete while any active student
  // still lacks a valid class placement in this Program.
  const enrolled=c.activeProgramStudents>0&&c.placedStudents>=c.activeProgramStudents;
  const hasWork=c.publishedAssessments>0&&(c.submittedWork+c.gradedWork)>0;
  const awaitingClasses=Math.max(0,c.activeProgramStudents-c.placedStudents);
  const hasApplicants=c.applications>0;
  const enrollmentAction=hasApplicants
    ? `/admissions?programId=${encoded}`
    : `/admissions/intake?programId=${encoded}${site?`&siteId=${site}`:""}`;

  return [
    {key:"launch",title:"Configure the school and review opening",
      state:programActive?"review":"needs_attention",
      evidence:programActive?"Program active; review current opening authority in the operating workspace.":
        journey?`Program ${program.status.replaceAll("_"," ")}; ${blocking.length} recorded blocking launch requirement(s)`:
          `Program ${program.status.replaceAll("_"," ")}; launch Journey unavailable. Readiness cannot be verified.`,
      nextAction:programActive&&program.siteId?"Open Site Today":programActive?"Review launch history":"Review genuine launch requirements and academic authority",
      href:programActive?operations:checklist,suggestedRole:"School registrar"},
    {key:"instruction",title:"Adopt curriculum, staff and provision classes",
      state:staffed?"review":"needs_attention",
      evidence:`${c.adoptedCurriculumPacks} active pack adoption(s) · ${c.publishedSections}/${c.sections} published sections · ${c.staffedSections}/${c.sections} staffed`,
      nextAction:staffed?"Review first-classroom readiness":"Configure course adoption, academic year and qualified teachers",
      href:academic,suggestedRole:"Curriculum publisher / school registrar"},
    {key:"enrollment",title:"Admit, enroll and place families",
      state:enrolled?"recorded":"needs_attention",
      evidence:`${c.applications} applications · ${c.activeProgramStudents} active program students · ${c.placedStudents} students placed${awaitingClasses?` · ${awaitingClasses} awaiting classes`:""}`,
      nextAction:enrolled?"Review admitted families and placements":
        hasApplicants?"Process applications, offers and class placement":
        "Start your first family intake",
      href:enrollmentAction,suggestedRole:"Registrar / guardian"},
    {key:"learning",title:"Deliver instruction and receive student work",
      state:hasWork?"recorded":"needs_attention",
      evidence:`${c.publishedAssessments} published assignments · ${c.submittedWork} awaiting grading · ${c.gradedWork} graded`,
      nextAction:hasWork?"Review instructional activity":"Publish work in the provisioned classroom",
      href:academic,suggestedRole:"Teacher / student"},
    {key:"response",title:"Review grades and respond to families",
      state:c.gradedWork>0?"review":"needs_attention",
      evidence:`${c.gradedWork} graded submissions · ${c.unresolvedGuardianResponses} outstanding guardian questions`,
      nextAction:c.unresolvedGuardianResponses?"Resolve guardian responses":"Review released grades, notifications and support actions",
      href:operations,suggestedRole:"Teacher / school registrar"},
    {key:"operations",title:"Continue in the operating workspace",
      state:"review",
      evidence:"Review current school-opening authority, staffing, admissions and academic activity in the operating workspace.",
      nextAction:programActive&&program.siteId?"Open Site Today and review operating requirements":"Review the school’s operating requirements",
      href:operations,suggestedRole:"School registrar"},
  ];
}


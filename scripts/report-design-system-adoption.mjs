import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { analyzeSource, discoverTsx } from "./lib/v61-source-audit.mjs";

// Inventory only. Never rewrite feature source or treat raw controls as a
// reliable count of noncompliance without reviewing the specific interaction.
const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const nativeTags = new Set(["button", "input", "select", "textarea", "label"]);
const canonicalTags = new Set([
  "SelectionCard", "SelectionChip", "SelectionChipGroup", "Button", "Field", "Input", "Select", "Textarea", "Checkbox", "Radio",
  "DirectoryTable", "QueryState", "WorkspaceNotice", "StatusBadge",
  "ActionDialog", "FormSection", "FormActions", "EmptyState",
  "RecordHeader", "RecordLayout", "RecordFacts", "EntityCard",
  "FieldTripFacts", "RecordedTime", "DeliveryReceiptFacts", "ActionFooter", "StatCard", "WorkspacePanel",
  "StatusTimeline", "EvidencePicker", "WorkspaceActionLink",
  "ClassParticipationAcknowledgments", "LaunchGuidancePanels",
  "CalendarInviteesPicker", "CalendarAgendaList", "NativeApprovedOfferingsPanel",
  "ClassOfferingTermsFields", "GuardianStudentIdentityFields", "GuardianTransferAuthorizationFields",
  "GuardianEnrollmentNextSteps", "GuardianGradeQuestions", "GuardianChildSummaryCard", "CoachCaseloadList", "CoachStudentTimeline", "PublicInterestRecordCard",
  "PublicInterestTimeline", "MarketingPackageLibraryList", "NoncreditParticipantRoster",
  "SchoolImprovementPanel", "OperationsHealthSummary", "OperationsIssueList",
  "CoachOutreachPanel", "TeacherLearningParticipationPanel",
  "StudentDashboardRail", "StudentUpcomingAssignments",
  "StudentReleasedGradesPanel", "StudentSchoolLifePanel",
  "StudentContinueLearningPanel", "StudentTodayAtGlance",
  "ClassTeacherGuidePanel", "ClassLessonDiscussions", "ClassLessonAssessmentLinks",
  "ClassPublishedResourcesList", "ClassSupplementContent",
  "CalendarEventFactsPanels", "CalendarRecordContextPanel",
  "GroupOverviewPanel", "GroupDetailsPanel", "GroupResourcesPanel",
  "GroupSessionsPanel", "GroupStudentMembershipPanel", "GroupDiscussionPanel",
  "GroupMembersPanel", "GroupReportsPanel", "NativeClassScheduleForm",
  "GroupMembershipRequestRow", "GroupModerationReportRow",
  "CalendarWeekGrid", "CalendarMonthGrid", "CalendarEventComposer",
  "BlueprintComponentPicker", "BlueprintReferencesPicker",
  "LaunchTeacherClassRequests", "LaunchClassroomPrerequisites",
  "OperationsActionCard",
  "ExtendedSeasonDraftForm", "ExtendedSeasonReadinessRequests",
]);
const files = discoverTsx(sourceRoot).filter(path => !path.endsWith("routeTree.gen.tsx"));

const families = {};
const sites = [];
const violations = [];
function familyFor(path) {
  const file = relative(sourceRoot, path).replaceAll("\\", "/");
  if (file.startsWith("components/ui/")) return "primitives";
  if (file.startsWith("components/workspace/")) return "workspace";
  if (file.startsWith("components/workflow/")) return "workflow";
  if (file.startsWith("components/evidence/")) return "evidence";
  if (file.startsWith("components/")) return "features";
  if (file.startsWith("routes/")) return "routes";
  return "other";
}

for (const path of files) {
  const source = readFileSync(path, "utf8");
  const file = relative(sourceRoot, path).replaceAll("\\", "/");
  const family = familyFor(path);
  const node = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const native = {}, canonical = {};
  function visit(child) {
    if (ts.isJsxOpeningElement(child) || ts.isJsxSelfClosingElement(child)) {
      const tag = child.tagName.getText(node);
      if (nativeTags.has(tag)) native[tag] = (native[tag] ?? 0) + 1;
      if (canonicalTags.has(tag)) canonical[tag] = (canonical[tag] ?? 0) + 1;
    }
    ts.forEachChild(child, visit);
  }
  visit(node);
  const audit = analyzeSource(source, path);
  const row = families[family] ??= { files: 0, native: {}, canonical: {}, auditedNative: 0, auditedCorners: 0, syntaxErrors: 0 };
  row.files++;
  row.auditedNative += audit.native.length;
  row.auditedCorners += audit.corners.length;
  row.syntaxErrors += audit.syntaxErrors.length;
  if (audit.native.length || audit.corners.length || audit.syntaxErrors.length) {
    violations.push({ file, family, native: audit.native, corners: audit.corners, syntaxErrors: audit.syntaxErrors });
  }
  for (const [tag,count] of Object.entries(native)) row.native[tag] = (row.native[tag] ?? 0) + count;
  for (const [tag,count] of Object.entries(canonical)) row.canonical[tag] = (row.canonical[tag] ?? 0) + count;
  const nativeTotal = Object.values(native).reduce((a,b)=>a+b,0);
  if (nativeTotal) sites.push({file, family, nativeTotal, tags:native});
}
sites.sort((a,b)=>b.nativeTotal-a.nativeTotal || a.file.localeCompare(b.file));
violations.sort((a,b)=>b.syntaxErrors.length-a.syntaxErrors.length ||
  (b.native.length+b.corners.length)-(a.native.length+a.corners.length) || a.file.localeCompare(b.file));
console.log(JSON.stringify({
  contract: "CAN OS V6.1 component adoption inventory",
  sourceFiles: files.length,
  families,
  leadingNativeControlConsumers: sites.slice(0,30),
  auditedDebt: {
    affectedFiles: violations.length,
    native: violations.reduce((sum,row)=>sum+row.native.length,0),
    corners: violations.reduce((sum,row)=>sum+row.corners.length,0),
    syntaxErrors: violations.reduce((sum,row)=>sum+row.syntaxErrors.length,0),
    files: violations,
  },
  note: "Inventory is diagnostic, not a compliance percentage. Raw usage counts are retained for continuity; auditedDebt uses the same analyzer and exemptions as the V6.1 source gate. Visual and behavioral acceptance require separate evidence.",
}, null, 2));

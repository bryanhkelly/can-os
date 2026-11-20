import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Inventory only. Never rewrite feature source or treat raw controls as a
// reliable count of noncompliance without reviewing the specific interaction.
const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const nativeTags = new Set(["button", "input", "select", "textarea", "label"]);
const canonicalTags = new Set([
  "Button", "Field", "Input", "Select", "Textarea", "Checkbox", "Radio",
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
]);
const files = [];
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith(".tsx") &&
      !/\.(?:stories|test|spec)\.tsx$/.test(entry.name) &&
      entry.name !== "routeTree.gen.tsx") files.push(path);
  }
}
walk(sourceRoot);

const families = {};
const sites = [];
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
  const row = families[family] ??= { files: 0, native: {}, canonical: {} };
  row.files++;
  for (const [tag,count] of Object.entries(native)) row.native[tag] = (row.native[tag] ?? 0) + count;
  for (const [tag,count] of Object.entries(canonical)) row.canonical[tag] = (row.canonical[tag] ?? 0) + count;
  const nativeTotal = Object.values(native).reduce((a,b)=>a+b,0);
  if (nativeTotal) sites.push({file, family, nativeTotal, tags:native});
}
sites.sort((a,b)=>b.nativeTotal-a.nativeTotal || a.file.localeCompare(b.file));
console.log(JSON.stringify({
  contract: "CAN OS V6.1 component adoption inventory",
  sourceFiles: files.length,
  families,
  leadingNativeControlConsumers: sites.slice(0,30),
  note: "Inventory is diagnostic, not a compliance percentage. Specialized native controls and legacy routes require individual migration review.",
}, null, 2));

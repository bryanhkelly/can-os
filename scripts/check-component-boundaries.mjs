#!/usr/bin/env node
/**
 * Component-boundary regression gate.
 *
 * This does not pretend the entire legacy app is migrated. It prevents
 * already consolidated UI families from importing routes/databases or growing
 * a second copy of the workflow UI in the old page.
 *
 * Source-only check: no DB, generated assets, login, or network required.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { sharedUiImportViolation, sourceDependencySpecifiers, resolveSourceDependency, runtimeDependencySpecifiers, featureRuntimeImportViolation } from "./lib/v61-component-dependencies.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const failures = [];
const files = new Set();

/** A build-independent syntax gate for extracted shared UI and its owners.
 * TypeScript's parser catches malformed JSX and incomplete refactor edits,
 * even when CI runners or cloud deployments are unavailable.
 */
function checkParseDiagnostics(file, source, program) {
  for (const diagnostic of program.parseDiagnostics) {
    const position = diagnostic.start ?? 0;
    const { line, character } = program.getLineAndCharacterOfPosition(position);
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
    failures.push(`${file}:${line + 1}:${character + 1}: syntax ${diagnostic.code}: ${message}`);
  }
}

function collect(directory) {
  for (const entry of readdirSync(resolve(root, directory), { withFileTypes: true })) {
    const name = join(directory, entry.name).replaceAll("\\", "/");
    if (entry.isDirectory()) collect(name);
    else if (entry.isFile() && /\.(ts|tsx)$/.test(name) &&
      !/\.(test|spec|stories)\.(ts|tsx)$/.test(name)) files.add(name);
  }
}
// Every production feature component is checked, not a growing hand-maintained allowlist.
collect("src/components");

for (const file of files) {
  const source = readFileSync(resolve(root, file), "utf8");
  const program = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  checkParseDiagnostics(file, source, program);
  for (const importPath of sourceDependencySpecifiers(program, ts)) {
    const dependencyProblem = sharedUiImportViolation(file, importPath);
    if (dependencyProblem) failures.push(file + ": " + dependencyProblem);
    const target = resolveSourceDependency(file, importPath);
    if (target && /^src\/(?:routes|db|workers|server)(?:\/|$)/.test(target)) {
      failures.push(file + ": feature presentation must not import route, database, server or worker code: " + importPath);
    }
    // Feature orchestration components may compose other feature components.
    // The shared-layer guard above independently forbids that dependency
    // from primitives, workspace patterns and workflow foundations.
  }
  for (const specifier of runtimeDependencySpecifiers(program, ts)) {
    const violation = featureRuntimeImportViolation(file, specifier);
    if (violation) failures.push(file + ": " + violation);
  }
  if (/\bcreateFileRoute\s*\(/.test(source) || /\bcreateServerFn\s*\(/.test(source))
    failures.push(file + ": shared presentation must not own a route or server command");
}

const owners = [
  ["src/components/operations/LaunchAcademicSetupWorkspace.tsx", [
    'data.classRequests.map(request=><article',
    'aria-label="Classroom setup guidance"',
  ]],
  ["src/components/launch-studio/CanonicalBlueprintWorkspace.tsx", [
    '<legend className="px-2 font-semibold">Blueprint components</legend>',
    '<legend className="px-2 font-semibold">Propose a local experience</legend>',
    "referenceCatalog.filter(reference =>",
  ]],
  ["src/routes/groups.tsx", [
    "pendingRequests.map(({ group, member }) => (",
    "openReports.map(({ group, report }) => (",
  ]],
  ["src/components/groups/GroupMembersPanel.tsx", ["group.pendingMembers.map(member => <div"]],
  ["src/components/groups/GroupReportsPanel.tsx", ["group.reports.map(report => <div"]],
  ["src/components/learning/NativeClassSessionsPanel.tsx", ['form onSubmit={e=>void createMeetings(e)}', 'name={"native-schedule-"+workspace.classId}']],
  ["src/routes/groups_.$groupId.tsx", [
    "function GroupOverviewPanel(", "function GroupDetailsPanel(",
    "function ResourcesPanel(", "function StudentMembershipPanel(",
    "function SessionsPanel(", "function DiscussionPanel(",
    "function MembersPanel(", "function ReportsPanel(",
  ]],
  ["src/routes/class.tsx", ["function OfferingCard(", "function ApprovedClassCard(",
    "function InvitationCard(", "function EnrolledClassCard("]],
  ["src/routes/calendar.tsx", ['<WorkspacePanel title="Event details" description="Schedule and description for this calendar event."', 'rail={<WorkspacePanel title="Record context"', "const groupPeople = new Map", "visibleInvitePeople.map(",
    '<ul className="mt-4 divide-y">{periodItems.map',
    '<ul className="mt-4 divide-y">{visibleItems.map',
    'viewDates.map(day=><section', 'cells.map((cell, index)',
    '<Modal open={composerOpen}', '<CalendarInviteesPicker',
  ]],
  ["src/routes/site-website.tsx", ["function WebsiteInformationChecklist(",
    "function WebsiteSourceMappingPanel(", "function WebsiteDesignChecklist(",
    "function WebsitePreviewPanel("]],
  ["src/components/launch-studio/MarketingPackagesV61.tsx", [
    "visible.map(item=><article",
    '<WorkspacePanel title="Package release"',
  ]],
  ["src/components/launch-studio/LaunchReadinessPanelV61.tsx", [
    'aria-label="Program to Offering delivery journey"',
    'aria-label="Solution planning state"',
    'aria-label="Program readiness state"',
    'aria-label="Website publication state"',
  ]],
  ["src/components/launch-studio/EstablishSiteInformationV61.tsx", [
    '<nav aria-label="Site Information sections"',
    "function SingleChoice(",
  ]],
  ["src/components/launch-studio/EstablishProgramsAudiencesV61.tsx", [
    "function ChoiceCard(",
  ]],
  ["src/components/admissions/PublicInterestInbox.tsx", ['aria-label="Family relationship history"', 'items.map(row => <article']],
  ["src/components/enrollment/NoncreditReleaseOperations.tsx", ['rows={query.data.roster}', '<h3 className="mt-7 text-base font-semibold">Participant roster</h3>']],
  ["src/components/enrollment/GuardianApplicationForm.tsx", ['<Label htmlFor={`${id}-transfer`}', '<Label htmlFor={`${id}-household`}']],
  ["src/components/student/StudentDashboard.tsx", ['<DashboardPanel id="student-schedule"', '<DashboardPanel title="Announcements"', '<DashboardPanel id="student-assignments"', '<DashboardPanel id="student-grades"', '<DashboardPanel id="school-life"', '<DashboardPanel id="continue-learning"', '<DashboardPanel title="Today at a Glance"']],
  ["src/components/home/TeacherHome.tsx", ['aria-label="Observed learning participation"']],
  ["src/components/operations/ExtendedLearningSeasonPlanner.tsx", ['<form noValidate onSubmit={createDraft}', "Optional evidence requests"]],
  ["src/components/home/CoachHome.tsx", ["students.map((student) => (", '<h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Timeline</h3>']],
  ["src/components/home/CoachHome.tsx", ['<section className="h-fit  border bg-card p-5"', 'onClick={submitOutreach}']],
  ["src/components/home/GuardianHome.tsx", ['<section aria-label="Enrollment next steps"', '<section aria-label="School responses to your grade questions"', "visibleChildren.map(child => <article"]],
  ["src/components/operations/OperationsHealthSummary.tsx", ["commandCenterData.issues.map("]],
  ["src/components/learning/NativeClassManager.tsx", ["const methodOptions:", "const creditOptions:", "function toggle<T extends string>", 'aria-label="Approved Offering hierarchy"']],
  ["src/components/operations/OperationsWorkspace.tsx", [
    "data.items.filter(item=>!selected.action||item.id===selected.action).map(i=><article",
    'aria-label="FullFlow operational record"',
    '<section aria-label="School improvement and planning"',
    '<section aria-label="Operations exception summary"',
  ]],
];
for (const [file, banned] of owners) {
  const source = readFileSync(resolve(root, file), "utf8");
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  checkParseDiagnostics(file, source, parsed);
  for (const legacy of banned) {
    if (source.includes(legacy)) failures.push(file + ": duplicate inline UI returned: " + legacy);
  }
}
if (failures.length) {
  for (const failure of failures) console.error("Component architecture: " + failure);
  process.exitCode = 1;
} else {
  console.log("Component architecture: " + files.size +
    " production component sources and " + owners.length + " feature owners verified.");
}

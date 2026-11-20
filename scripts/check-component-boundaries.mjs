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

const root = fileURLToPath(new URL("../", import.meta.url));
const guardedDirectories = [
  "src/components/ui",
  "src/components/workspace",
  "src/components/workflow",
  "src/components/calendar",
  "src/components/sites",
  "src/components/learning/native-class",
];
const guardedFiles = [
  "src/components/operations/SchoolImprovementPanel.tsx",
  "src/components/operations/OperationsHealthSummary.tsx",
  "src/components/operations/OperationsIssueList.tsx",
  "src/components/learning/ClassParticipationAcknowledgments.tsx",
  "src/components/learning/ClassOfferingTermsFields.tsx",
  "src/components/enrollment/GuardianApplicationDetailsFields.tsx",
  "src/components/admissions/PublicInterestRecordCard.tsx",
  "src/components/admissions/PublicInterestTimeline.tsx",
  "src/components/launch-studio/MarketingPackageLibraryList.tsx",
  "src/components/learning/NativeApprovedOfferingsPanel.tsx",
  "src/components/enrollment/NoncreditParticipantRoster.tsx",
  "src/components/launch-studio/LaunchGuidancePanels.tsx",
  "src/components/home/GuardianEnrollmentNextSteps.tsx",
  "src/components/home/GuardianGradeQuestions.tsx",
];
const failures = [];
const files = [];

function collect(directory) {
  for (const entry of readdirSync(resolve(root, directory), { withFileTypes: true })) {
    const name = join(directory, entry.name).replaceAll("\\", "/");
    if (entry.isDirectory()) collect(name);
    else if (entry.isFile() && /\.(ts|tsx)$/.test(name) &&
      !/\.(test|spec|stories)\.(ts|tsx)$/.test(name)) files.push(name);
  }
}
for (const dir of guardedDirectories) collect(dir);
files.push(...guardedFiles);

for (const file of files) {
  const source = readFileSync(resolve(root, file), "utf8");
  const program = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  for (const node of program.statements) {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
    const importPath = node.moduleSpecifier.text;
    if (importPath.startsWith("@/routes/") || importPath.startsWith("@/db/") ||
        importPath.startsWith("@/workers/")) {
      failures.push(file + ": shared UI must not import route, database, or worker code: " + importPath);
    }
    if (importPath.includes("/components/operations/OperationsWorkspace") ||
        importPath.includes("/components/learning/NativeClassManager")) {
      failures.push(file + ": reusable UI must not depend on oversized feature orchestrators");
    }
  }
  if (/\bcreateFileRoute\s*\(/.test(source) || /\bcreateServerFn\s*\(/.test(source))
    failures.push(file + ": shared presentation must not own a route or server command");
}

const owners = [
  ["src/routes/class.tsx", ["function OfferingCard(", "function ApprovedClassCard(",
    "function InvitationCard(", "function EnrolledClassCard("]],
  ["src/routes/calendar.tsx", ["const groupPeople = new Map", "visibleInvitePeople.map(",
    '<ul className="mt-4 divide-y">{periodItems.map',
    '<ul className="mt-4 divide-y">{visibleItems.map']],
  ["src/routes/site-website.tsx", ["function WebsiteInformationChecklist(",
    "function WebsiteSourceMappingPanel(", "function WebsiteDesignChecklist(",
    "function WebsitePreviewPanel("]],
  ["src/components/launch-studio/MarketingPackagesV61.tsx", ["visible.map(item=><article"]],
  ["src/components/admissions/PublicInterestInbox.tsx", ['aria-label="Family relationship history"', 'items.map(row => <article']],
  ["src/components/enrollment/NoncreditReleaseOperations.tsx", ['rows={query.data.roster}', '<h3 className="mt-7 text-base font-semibold">Participant roster</h3>']],
  ["src/components/enrollment/GuardianApplicationForm.tsx", ['<Label htmlFor={`${id}-transfer`}', '<Label htmlFor={`${id}-household`}']],
  ["src/components/home/GuardianHome.tsx", ['<section aria-label="Enrollment next steps"', '<section aria-label="School responses to your grade questions"']],
  ["src/components/operations/OperationsHealthSummary.tsx", ["commandCenterData.issues.map("]],
  ["src/components/learning/NativeClassManager.tsx", ["const methodOptions:", "const creditOptions:", "function toggle<T extends string>", 'aria-label="Approved Offering hierarchy"']],
  ["src/components/operations/OperationsWorkspace.tsx", [
    '<section aria-label="School improvement and planning"',
    '<section aria-label="Operations exception summary"',
  ]],
];
for (const [file, banned] of owners) {
  const source = readFileSync(resolve(root, file), "utf8");
  for (const legacy of banned) {
    if (source.includes(legacy)) failures.push(file + ": duplicate inline UI returned: " + legacy);
  }
}
if (failures.length) {
  for (const failure of failures) console.error("Component architecture: " + failure);
  process.exitCode = 1;
} else {
  console.log("Component architecture: " + files.length +
    " shared presentation sources and " + owners.length + " feature owners verified.");
}

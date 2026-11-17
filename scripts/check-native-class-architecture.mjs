#!/usr/bin/env node
/**
 * Native Class is a domain boundary, not a compatibility adapter for school
 * Sections or parallel CAN/canonical account identities.
 *
 * This check intentionally targets the files that own the native Class model.
 * Legacy modules remain operational until evidence-preserving migration and
 * reconciliation are proven. Expand coverage only after removing dependencies,
 * never by adding exceptions to new Class code.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const nativeOwners = [
  "src/db/canonical-v301/classes.ts",
  "src/domain/unified-class.ts",
  "src/modules/classes/class-staff.functions.ts",
  "src/modules/classes/native-class-workspace.functions.ts",
  "src/routes/class_.$classId.tsx",
  "src/routes/class.tsx",
  "src/components/learning/NativeClassManager.tsx",
  "src/components/learning/NativeClassHomeNavigation.tsx",
  "src/components/learning/PublisherCourseActivityEditor.tsx",
  "src/components/learning/ProviderInstructionHome.tsx",
  "src/components/learning/ProviderInstructionDraft.tsx",
  "src/components/learning/ProviderInstructionReviews.tsx",
];
const forbidden = [
  { term: /\bsectionTeachers\b|\bsectionIds\b|\bsectionId\b/, reason: "legacy Section ownership" },
  { term: /\baccessAccountNoncreditPrincipals\b|\baccessAccountCanonicalPrincipals\b/, reason: "dual-identity account linking" },
  { term: /\bcanonicalSessionCookie\b/, reason: "second learner bearer credential" },
  { term: /["']@\/modules\/learning\/class-access(?:\.server)?["']/, reason: "legacy classroom authorization" },
];
let errors = 0;
for (const path of nativeOwners) {
  const source = readFileSync(resolve(root, path), "utf8");
  for (const rule of forbidden) {
    if (rule.term.test(source)) {
      console.error(`Native Class architecture: ${path} depends on ${rule.reason}`);
      errors++;
    }
  }
}
// Native Classes authenticate without projecting retiring school Sections.
const canonicalContext = readFileSync(
  resolve(root, "src/modules/identity/canonical-command-context.server.ts"), "utf8");
const coreIdentity = readFileSync(
  resolve(root, "src/modules/identity/command-context.server.ts"), "utf8");
if (!canonicalContext.includes("getIdentityContext(request)") ||
    canonicalContext.includes("getCommandContext(request)")) {
  console.error("Native Class authentication must use Section-free CAN identity");
  errors++;
}
const coreStart = coreIdentity.indexOf("export async function getIdentityContext(");
const legacyStart = coreIdentity.indexOf("export async function getCommandContext(", coreStart);
if (coreStart < 0 || legacyStart < 0 ||
    /\bsectionTeachers\b|\bsectionIds\b|\bsectionId\b/.test(
      coreIdentity.slice(coreStart, legacyStart))) {
  console.error("Core identity must not project retiring school Section scope");
  errors++;
}
// Once a staged Class interface is promoted, the parking-lot route must
// never reacquire independent business logic. Keep publisher commands in
// the reusable editor and server authorization boundaries.
const stagedActivities = readFileSync(
  resolve(root, "src/routes/canonical.course-activities.tsx"), "utf8");
const productionClasses = readFileSync(resolve(root, "src/routes/class.tsx"), "utf8");
const promotedActivities = readFileSync(
  resolve(root, "src/components/learning/PublisherCourseActivityEditor.tsx"), "utf8");
if (!stagedActivities.includes('to="/class" search={{view:"activities"}}') ||
    stagedActivities.includes("createCanonicalSurveyDraft") ||
    stagedActivities.includes("createCanonicalObjectiveDraft") ||
    !productionClasses.includes('value.view==="activities"') ||
    !productionClasses.includes("PublisherCourseActivityEditor") ||
    !promotedActivities.includes("getPublisherCourseActivityOptions")) {
  console.error("Native Class architecture: publisher activities must be owned by /class");
  errors++;
}

// The canonical/ pages are deliberately staging redirects only. Keep
// independently governed author and reviewer commands in reusable /class
// components and their original server-side authority gates.
for (const [stagingPath,searchHint,forbiddenCommand] of [
  ["src/routes/canonical.content.tsx",'view:"content"',"createRecordedInstructionDraft"],
  ["src/routes/canonical.content_.$trackVersionId.tsx",'trackVersionId',"saveRecordedInstructionDraft"],
  ["src/routes/canonical.content-reviews.tsx",'view:"reviews"',"decideRecordedInstructionReview"],
]) {
  const staged=readFileSync(resolve(root,stagingPath),"utf8");
  if(!staged.includes('Navigate to="/class"')||
     !staged.includes(searchHint)||staged.includes(forbiddenCommand)) {
    console.error("Native Class architecture: staged content route must only redirect: "+stagingPath);
    errors++;
  }
}
for (const [component,requiredCommand] of [
  ["ProviderInstructionHome","createRecordedInstructionDraft"],
  ["ProviderInstructionDraft","saveRecordedInstructionDraft"],
  ["ProviderInstructionReviews","decideRecordedInstructionReview"],
]) {
  const source=readFileSync(resolve(root,
    "src/components/learning/"+component+".tsx"),"utf8");
  if(source.includes("createFileRoute")||!source.includes(requiredCommand)||
     !productionClasses.includes(component)) {
    console.error("Native Class architecture: missing promoted content component "+component);
    errors++;
  }
}

if (errors > 0) process.exitCode = 1;
else console.log(`Native Class architecture boundary verified: ${nativeOwners.length} owners`);

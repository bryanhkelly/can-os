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
import { readFileSync, existsSync } from "node:fs";
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
  "src/components/learning/native-class/OfferingCard.tsx",
  "src/components/learning/native-class/ApprovedClassCard.tsx",
  "src/components/learning/native-class/InvitationCard.tsx",
  "src/components/learning/native-class/EnrolledClassCard.tsx",
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
if (existsSync(resolve(root, "src/routes/classes.tsx"))) {
  console.error("Native Class architecture: duplicate classroom route is forbidden");
  errors++;
}
const canonicalDirectory = readFileSync(resolve(root, "src/routes/class.tsx"), "utf8");
if (/LegacySectionClassPage|SectionClassEntry|import\(["']\.\/classes["']\)/.test(canonicalDirectory)) {
  console.error("Native Class architecture: canonical directory must not embed retired classroom code");
  errors++;
}

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
// Old staging route files must stay absent; the native Class entry owns their operations.
const retiredPaths = [
  "src/routes/classes.tsx",
  "src/routes/canonical.classes.tsx",
  "src/routes/canonical.classes_.completion.tsx",
  "src/routes/canonical.course-activities.tsx",
  "src/routes/canonical.content.tsx",
  "src/routes/canonical.content_.$trackVersionId.tsx",
  "src/routes/canonical.content-reviews.tsx",
  "src/routes/reports.classes_.$classId.tsx",
];
for(const file of retiredPaths){
  if(existsSync(resolve(root,file))){
    console.error("Native Class architecture: retired route unexpectedly exists: "+file);
    errors++;
  }
}
const productionClasses=readFileSync(resolve(root,"src/routes/class.tsx"),"utf8");
const promotedActivities=readFileSync(resolve(root,"src/components/learning/PublisherCourseActivityEditor.tsx"),"utf8");
if(!productionClasses.includes('value.view==="activities"')||
   !productionClasses.includes("PublisherCourseActivityEditor")||
   !promotedActivities.includes("getPublisherCourseActivityOptions")){
  console.error("Native Class architecture: publisher activities must be owned by /class");
  errors++;
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

// The route composes independently testable learner actions. Do not move
// enrollment, invitation, transfer, or withdrawal commands back into /class.
const learnerCards = [
  "OfferingCard", "ApprovedClassCard", "InvitationCard", "EnrolledClassCard",
];
for (const name of learnerCards) {
  const card=readFileSync(resolve(root, "src/components/learning/native-class/"+name+".tsx"), "utf8");
  if (!productionClasses.includes('import { '+name+' } from "@/components/learning/native-class/'+name+'";') ||
      !productionClasses.includes("<"+name) ||
      productionClasses.includes("function "+name+"(") ||
      !card.includes("export function "+name+"(")) {
    console.error("Native Class architecture: learner action card must stay in reusable component "+name);
    errors++;
  }
}
if (productionClasses.includes("enrollCurrentPersonInClass") ||
    productionClasses.includes("transferMyNativeClassEnrollment") ||
    productionClasses.includes("withdrawMyNativeClassEnrollment") ||
    productionClasses.includes("declineNativeClassInvitation")) {
  console.error("Native Class architecture: learner mutation commands must not be duplicated in the route");
  errors++;
}

if (errors > 0) process.exitCode = 1;
else console.log(`Native Class architecture boundary verified: ${nativeOwners.length} owners`);

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
if (errors > 0) process.exitCode = 1;
else console.log(`Native Class architecture boundary verified: ${nativeOwners.length} owners`);

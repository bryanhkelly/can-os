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
if (errors > 0) process.exitCode = 1;
else console.log(`Native Class architecture boundary verified: ${nativeOwners.length} owners`);

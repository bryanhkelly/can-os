#!/usr/bin/env node
/**
 * Single-entry orchestration for CAN's synthetic academic marketplace.
 *
 * Default: deterministic local manifests only (no database connection/writes).
 * --inspect: read-only curriculum import plan on the selected Neon branch.
 * --apply: guarded curriculum and teacher draft imports on the same isolated branch.
 * Existing importer safety checks remain authoritative; neither script
 * publishes content nor grants real teaching qualifications.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const inspect = argv.includes("--inspect");
if (apply && inspect) throw Error("Choose --apply or --inspect, not both");
if (argv.some(flag => !["--apply", "--inspect"].includes(flag)))
  throw Error("Supported flags: --inspect, --apply");
const workspace = mkdtempSync(join(tmpdir(), "can-demo-academic-marketplace-"));
const catalogPath = join(workspace, "curriculum.json");
const teachersPath = join(workspace, "teachers.json");
const run = (args, env = process.env) => {
  const output = execFileSync(process.execPath, args, {
    encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  if (output) console.log(output);
};
try {
  run(["scripts/demo-curriculum-factory.mjs", "--output", catalogPath, "--deep", "15"]);
  run(["scripts/demo-teacher-marketplace-factory.mjs",
    "--catalog", catalogPath, "--output", teachersPath]);
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  const teachers = JSON.parse(readFileSync(teachersPath, "utf8"));
  if (catalog.courses.length !== 120 || catalog.courses.filter(c => c.deepDemo).length !== 15 ||
      teachers.teachers.length !== 30 || teachers.courseTeachers.length !== 120 ||
      teachers.staffingExamples.length !== 15)
    throw Error("Demo catalog coverage is incomplete");
  if (!apply && !inspect) {
    console.log(JSON.stringify({
      mode: "manifests_only", databaseTouched: false,
      courses: 120, teachers: 30, courseTeacherPairs: 240, classPlanningExamples: 15,
      next: "Use --inspect to check an isolated Neon branch or --apply with the guarded import env",
    }, null, 2));
    process.exitCode = 0;
  } else {
    const publisher = process.env.DEMO_CURRICULUM_PUBLISHER_ID;
    if (!publisher) throw Error("Set DEMO_CURRICULUM_PUBLISHER_ID to the verified CAN Demo Publisher UUID");
    if (!process.env.DATABASE_URL) throw Error("DATABASE_URL must point to the isolated Neon branch");
    if (apply) {
      if (process.env.DEMO_CURRICULUM_ALLOW_WRITE !== "1" ||
          process.env.DEMO_TEACHERS_ALLOW_WRITE !== "1" ||
          process.env.DEMO_CURRICULUM_DATABASE_CONFIRMED !== process.env.DEMO_TEACHERS_DATABASE_CONFIRMED ||
          !process.env.DEMO_CURRICULUM_DATABASE_CONFIRMED)
        throw Error("Both explicit write opt-ins and matching branch database confirmations are required");
    }
    run(["--import", "tsx", "scripts/import-demo-curriculum.mjs",
      "--file", catalogPath, "--publisher", publisher, ...(apply ? ["--apply"] : [])]);
    if (apply) {
      run(["scripts/import-demo-teachers.mjs", "--catalog", catalogPath,
        "--teachers", teachersPath, "--apply"]);
      console.log(JSON.stringify({
        mode: "imported_drafts", teacherOffers: "synthetic_preview_only",
        actualTeachingAssignments: 0, sectionsCreated: 0,
        publication: "not_performed", academicApproval: "not_performed",
      }, null, 2));
    } else {
      console.log(JSON.stringify({
        mode: "curriculum_dry_run", teacherImportDeferred: true,
        reason: "Teacher loader requires the 120 course records to exist on the branch",
      }, null, 2));
    }
  }
} finally {
  rmSync(workspace, { recursive: true, force: true });
}

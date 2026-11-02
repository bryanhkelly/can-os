import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const directory = mkdtempSync(join(tmpdir(), "can-demo-teachers-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

function generate() {
  const catalogPath = join(directory, "curriculum.json");
  const teachersPath = join(directory, "teachers.json");
  execFileSync(process.execPath, ["scripts/demo-curriculum-factory.mjs", "--output", catalogPath, "--deep", "15"]);
  execFileSync(process.execPath, ["scripts/demo-teacher-marketplace-factory.mjs",
    "--catalog", catalogPath, "--output", teachersPath]);
  return {
    curriculum: JSON.parse(readFileSync(catalogPath, "utf8")),
    teachers: JSON.parse(readFileSync(teachersPath, "utf8")),
    generated: readFileSync(teachersPath, "utf8"),
  };
}

describe("CAN Academy synthetic teacher marketplace", () => {
  it("maps all 120 courses to two qualified-by-subject illustrative teachers", () => {
    const { curriculum, teachers } = generate();
    expect(teachers.format).toBe("can-os-demo-teacher-marketplace-v1");
    expect(teachers.provider.metadata.isSynthetic).toBe(true);
    expect(teachers.teachers).toHaveLength(30);
    expect(teachers.courseTeachers).toHaveLength(120);
    expect(teachers.staffingExamples).toHaveLength(15);
    const catalog = new Map(curriculum.courses.map((course: {code: string;subject: string}) =>
      [course.code, course]));
    const byKey = new Map(teachers.teachers.map((teacher: {key: string}) => [teacher.key, teacher]));
    expect(new Set(teachers.teachers.map((teacher: {key: string}) => teacher.key)).size).toBe(30);
    for (const pair of teachers.courseTeachers) {
      const course = catalog.get(pair.courseCode) as {subject: string} | undefined;
      const primary = byKey.get(pair.primaryTeacherKey) as {primarySubject: string;courseCodes: string[]} | undefined;
      const alternate = byKey.get(pair.alternateTeacherKey) as {primarySubject: string;courseCodes: string[]} | undefined;
      expect(course).toBeDefined();
      expect(primary?.primarySubject).toBe(course?.subject);
      expect(alternate?.primarySubject).toBe(course?.subject);
      expect(primary?.courseCodes).toContain(pair.courseCode);
      expect(alternate?.courseCodes).toContain(pair.courseCode);
      expect(pair.primaryTeacherKey).not.toBe(pair.alternateTeacherKey);
    }
    expect(teachers.teachers.reduce((count: number, t: {courseCodes: string[]}) =>
      count + t.courseCodes.length, 0)).toBe(240);
  });

  it("is byte-for-byte reproducible and does not pretend to verify credentials or assign classes", () => {
    const first = generate();
    const second = generate();
    expect(second.generated).toBe(first.generated);
    expect(first.teachers.provenance.credentialsVerified).toBe(false);
    expect(first.teachers.provenance.assignmentsAuthorized).toBe(false);
    expect(first.teachers.staffingExamples.every((example: {status: string}) =>
      example.status === "planning_only")).toBe(true);
    expect(first.teachers.teachers.every((teacher: {email: string;verified: boolean}) =>
      teacher.email.endsWith("@example.invalid") && teacher.verified === false)).toBe(true);
    expect(first.teachers.teachers.some((teacher: {availability: {weeklyPattern: {days: number[]}}}) =>
      teacher.availability.weeklyPattern.days.includes(0))).toBe(true);
  });

  it("rejects an unconfirmed writer before contacting a database", () => {
    const run = spawnSync(process.execPath, ["scripts/import-demo-teachers.mjs",
      "--apply", "--catalog", "unused.json", "--teachers", "unused.json"], {
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: "postgresql://demo:demo@ep-example.us-east-1.aws.neon.tech/demo",
        DEMO_TEACHERS_ALLOW_WRITE: "",
        DEMO_TEACHERS_DATABASE_CONFIRMED: "",
        DEMO_TEACHERS_HOST_CONFIRMED: "",
        CAN_APPLICATION_DB_HOST: "",
      },
    });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("Write requires");
  });
});

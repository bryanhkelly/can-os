import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("canonical Class navigation", () => {
  it("uses one public Class directory and one exact-ID Class workspace", () => {
    const directory = source("src/routes/class.tsx");
    const workspace = source("src/routes/class_.$classId.tsx");
    expect(directory).toContain('createFileRoute("/class")');
    expect(workspace).toContain('createFileRoute("/class_/$classId")');
    expect(directory).not.toContain('import("./classes")');
    expect(directory).not.toContain("LegacySectionClassPage");
    expect(directory).not.toContain("SectionClassEntry");
    expect(workspace).toContain("getNativeClassWorkspace");
    expect(workspace).toContain('to="/class/$classId"');
  });

  it("does not register a parallel classroom route or carry old identifiers in the canonical directory", () => {
    const directory = source("src/routes/class.tsx");
    const navigation = source("src/components/shell/route-navigation.ts");
    expect(directory).not.toContain('section:selectedClassUuid');
    expect(navigation).not.toContain('"/classes": hidden(');
  });

  it("uses the authorized person profile for teacher links", () => {
    const teacherDirectory = source("src/routes/operations.teacher-marketplace.tsx");
    expect(teacherDirectory).toContain('to="/profiles" search={{person:teacher.personId}}');
    expect(teacherDirectory).not.toContain('teacher.isSynthetic ? teacher.name :');
  });

  it("keeps learner and operator commands behind the Class authority service", () => {
    const workspace = source("src/modules/classes/native-class-workspace.functions.ts");
    expect(workspace).toContain("getCanonicalCommandContext");
    expect(workspace).toContain("currentClassAuthority");
    expect(workspace).toContain("canonicalClassEnrollments");
  });
});

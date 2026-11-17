import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
const read = (path: string) => readFileSync(path, "utf8");

describe("native Class route ownership", () => {
  it("uses canonical native Class directory and detail without alias files", () => {
    expect(read("src/routes/class.tsx")).toContain('createFileRoute("/class")');
    expect(read("src/routes/class_.$classId.tsx")).toContain('createFileRoute("/class_/$classId")');
    expect(existsSync("src/routes/learn.classes.tsx")).toBe(false);
    expect(existsSync("src/routes/classes_.$classId.tsx")).toBe(false);
    expect(read("src/components/shell/route-navigation.ts")).toContain('"/class": page("/class", all)');
  });
  it("does not send native learners into the academic Section route", () => {
    for (const file of [
      "src/routes/class.tsx","src/routes/class_.$classId.tsx",
      "src/routes/join.tsx","src/routes/canonical.classes.tsx",
      "src/routes/reports.classes_.$classId.tsx",
      "src/components/learning/NativeClassSessionsPanel.tsx",
      "src/components/learning/NativeClassSessionAgenda.tsx",
      "src/components/launch-studio/SiteNativeClassHandoff.tsx",
    ]) {
      const source=read(file);
      expect(source).not.toContain('to="/classes"');
      expect(source).not.toContain('to="/classes/$classId"');
      expect(source).not.toContain('to="/learn/classes"');
    }
    expect(read("src/domain/site-enrollment-opportunities.ts")).toContain('"/class?classId="');
    expect(read("src/domain/participation-projections.ts")).toContain('href: "/class/" + hrefId(item.classId)');
  });
});

import { describe, expect, it } from "vitest";
import { demoPersonaHome, getDemoPersona, visibleDemoLinks } from "@/components/student/DemoNavigation";

describe("synthetic demo persona navigation", () => {
 it("defaults malformed and absent personas to student", () => {
  expect(getDemoPersona(null)).toBe("student");
  expect(getDemoPersona("admin")).toBe("student");
  expect(getDemoPersona("teacher")).toBe("teacher");
 });
 it("shows only intended workflow links for each role", () => {
  const paths=(role: Parameters<typeof visibleDemoLinks>[0])=>visibleDemoLinks(role).map(x=>x.to);
  expect(paths("student")).toContain("/student/assignments");
  expect(paths("student")).not.toContain("/admissions");
  expect(paths("teacher")).toContain("/teacher/missing-work");
  expect(paths("teacher")).not.toContain("/admissions/capacity");
  expect(paths("registrar")).toContain("/admissions/capacity");
  expect(paths("registrar")).not.toContain("/student/settings");
  expect(paths("specialist")).toContain("/student/support");
  expect(paths("specialist")).not.toContain("/teacher/discussions");
 });
 it("always provides a landing route for every demo role", () => {
  for (const role of ["student","teacher","guardian","registrar","specialist"] as const) {
   expect(demoPersonaHome[role]).toMatch(/^\//);
   expect(pathsFor(role)).toContain(demoPersonaHome[role]);
  }
 });
});
function pathsFor(role: Parameters<typeof visibleDemoLinks>[0]) {
 return visibleDemoLinks(role).map(x=>x.to);
}

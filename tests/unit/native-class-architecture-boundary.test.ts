import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const owners = [
  "src/db/canonical-v301/classes.ts",
  "src/domain/unified-class.ts",
  "src/modules/classes/class-staff.functions.ts",
  "src/modules/classes/native-class-workspace.functions.ts",
  "src/routes/class_.$classId.tsx",
];

describe("native Class ownership is independent of legacy academic structures", () => {
  it("does not import school Section data or crosswalks into native Class owners", () => {
    for (const path of owners) {
      const code = source(path);
      expect(code, path).not.toMatch(/\bsectionTeachers\b|\bsectionIds\b|\bsectionId\b/);
      expect(code, path).not.toMatch(/\baccessAccountNoncreditPrincipals\b|\baccessAccountCanonicalPrincipals\b/);
      expect(code, path).not.toContain("canonicalSessionCookie");
    }
  });

  it("resolves native Class authentication without enriching legacy teacher Sections", () => {
    const core = source("src/modules/identity/command-context.server.ts");
    const native = source("src/modules/identity/canonical-command-context.server.ts");
    const legacy = source("src/modules/identity/retiring-school-section-scope.server.ts");
    expect(core).toContain("export async function getIdentityContext(");
    expect(native).toContain("getIdentityContext(request)");
    expect(native).not.toContain("getCommandContext(request)");
    expect(legacy).toContain("projectRetiringSchoolSectionScope(");
    expect(core).not.toContain("sectionTeachers");
    expect(core).not.toContain("listInstitutionallyAuthorizedAcademicProgramIds(");
  });

  it("runs the architecture check in both standard and Cloudflare builds", () => {
    const pkg = JSON.parse(source("package.json")) as { scripts: Record<string,string> };
    expect(pkg.scripts.prebuild).toContain("check:class-architecture");
    expect(pkg.scripts["prebuild:cloudflare"]).toContain("check:class-architecture");
  });
});

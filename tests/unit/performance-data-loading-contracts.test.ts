import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("performance regression contracts", () => {
  it("uses one bulk policy and prerequisite lookup for the authorized course catalog", () => {
    const registration = source("src/modules/learning/course-registration.functions.ts");
    const policy = source("src/modules/learning/section-registration-policy-service.ts");
    expect(registration).toContain("getSectionRegistrationPolicies(catalogIds)");
    expect(registration).not.toContain("catalog.map(async course");
    expect(registration).not.toContain("getSectionRegistrationPolicy(course.id)");
    expect(policy).toContain("if (!unique.length) return result");
    expect(policy).toContain("where(inArray(sections.id, unique))");
    expect(policy).toContain("where(inArray(sectionPrerequisites.sectionId, unique))");
    expect(policy).toContain("effectivePolicy(row, prerequisitesById.get(row.id) ?? [])");
    expect(registration).toContain("getSectionRegistrationPolicy(section.id,tx)");
  });

  it("runs independent student home reads concurrently with ordered bounded resume probes", () => {
    const sourceText = source("src/components/home/StudentHome.tsx");
    expect(sourceText).toContain("const classesPromise = safeLoader(() => getMyStudentClasses())()");
    expect(sourceText).toContain("offset += 3");
    expect(sourceText).toContain("const results = await Promise.all(batch.map(section =>");
    expect(sourceText).toContain("for (let index = 0; index < batch.length; index++)");
    expect(sourceText).toContain("const classes = await classesPromise");
  });

  it("times supplementary operations requests before errors are classified", () => {
    const sourceText = source("src/components/home/OperationsHome.tsx");
    expect(sourceText).toContain('supplementaryRead(() => measureServerStep("operations.home", "release-health"');
    expect(sourceText).toContain('supplementaryRead(() => measureServerStep("operations.home", "command-center"');
    expect(sourceText).toContain('supplementaryRead(() => measureServerStep("operations.home", "full-flow"');
    expect(sourceText).not.toContain('measureServerStep("operations.home", "release-health", () => supplementaryRead(');
  });
});

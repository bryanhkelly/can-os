import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkspaceLinkNavigation } from "@/components/workspace/workspace-link-navigation";
import { DetailNavigation } from "@/components/workspace/workspace-panel";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, TableRowHead } from "@/components/ui/table";

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("V6.1 navigation consolidation", () => {
  it("renders navigation destinations without owning access rules or router state", () => {
    const html = renderToStaticMarkup(<WorkspaceLinkNavigation label="Curriculum workflows" surface="plain">
      <a href="/curriculum">Browse</a><a href="/resources">Resources</a>
    </WorkspaceLinkNavigation>);
    expect(html).toContain('aria-label="Curriculum workflows"');
    expect(html).toContain('data-workspace-link-navigation="plain"');
    expect(html.match(/<nav\b/g)).toHaveLength(1);
    expect(html).toContain('href="/resources"');
  });

  it("preserves selected-section semantics with one active tab", () => {
    const html = renderToStaticMarkup(<DetailNavigation label="Class sections" variant="record">
      <a href="#overview">Overview</a>
      <a href="#grades" aria-current="page">Grades</a>
    </DetailNavigation>);
    expect(html).toContain('aria-label="Class sections"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain("border-primary");
  });

  it.each([
    "src/routes/operations.curriculum-marketplace.tsx",
    "src/routes/operations.insights.tsx",
    "src/routes/classes.tsx",
  ])("uses shared link navigation instead of local wrappers: %s", path => {
    const code = source(path);
    expect(code).toContain("<WorkspaceLinkNavigation");
    expect(code).not.toMatch(/<nav\b/);
  });

  it.each([
    "src/routes/operations.curriculum.tsx",
    "src/routes/guardian.experiences.tsx",
    "src/routes/class_.$classId.tsx",
  ])("uses shared explicit-current tabs instead of local wrappers: %s", path => {
    const code = source(path);
    expect(code).toContain("<DetailNavigation");
    expect(code).toContain("<SectionTab");
    expect(code).not.toMatch(/<nav\b/);
  });

  it("reuses canonical program scope navigation without duplicated JSX attributes", () => {
    const code = source("src/components/learning/CurriculumProgramNavigation.tsx");
    expect(code).toContain('<WorkspaceLinkNavigation label="Curriculum program scope"');
    expect(code).not.toMatch(/<nav\b/);
    expect(code).toContain('selectedProgramId === program.id');
    expect(code).toContain('aria-current={selectedProgramId === program.id ? "page" : undefined}');
    expect(code).not.toMatch(/className="min-h-11"\s+className=/);
  });

  it("uses shared selected tabs across all Capability Lab sections", () => {
    const code = source("src/components/capability-lab/CapabilityLabNav.tsx");
    expect(code).toContain('<DetailNavigation label="Capability Lab sections"');
    expect(code).toContain("<SectionTab");
    expect(code).not.toMatch(/<nav\b/);
    expect(code).toContain('surveyDraftEnabled || current === "survey-drafts"');
    expect(code).toContain('surveyPublicationEnabled || current === "survey-publications"');
  });

  it("retains the independent class view and class section selection inputs", () => {
    const code = source("src/routes/class_.$classId.tsx");
    expect(code).toContain('label="Class views"');
    expect(code).toContain('label="Class sections"');
    expect(code).toContain("workspace.availableViews.map");
    expect(code).toContain("workspace.availableTabs.map");
    expect(code).toContain("lesson:undefined,session:undefined");
  });
});

describe("V6.1 semantic table consolidation", () => {
  it("renders caption, scroll region, column headers and distinct row headings", () => {
    const html = renderToStaticMarkup(<Table scrollLabel="Gradebook grid" aria-label="Gradebook grid">
      <TableCaption>Gradebook grid</TableCaption>
      <TableHeader><TableRow><TableHead scope="col">Student</TableHead>
        <TableHead scope="col">Assessment</TableHead></TableRow></TableHeader>
      <TableBody><TableRow><TableRowHead>Jordan Lee</TableRowHead>
        <TableCell>Returned</TableCell></TableRow></TableBody>
    </Table>);
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Gradebook grid"');
    expect(html).toMatch(/tabindex="0"/i);
    expect(html).toContain("<caption");
    expect(html).toContain('scope="col"');
    expect(html).toContain('scope="row"');
  });

  it("uses shared table primitives in the teacher gradebook without changing its cell interaction contract", () => {
    const gradebook = source("src/routes/teacher.gradebook.tsx");
    const header = source("src/components/learning/GradebookAssessmentHeader.tsx");
    expect(gradebook).toContain('<Table scrollLabel="Gradebook student assessment grid"');
    expect(gradebook).toContain("<TableRowHead");
    expect(header).toContain('<TableHead scope="col"');
    expect(gradebook).not.toMatch(/<table\b|<thead\b|<tbody\b|<td\b/);
    expect(header).not.toMatch(/<th\b/);
    expect(gradebook).toContain("data-cell=");
    expect(gradebook).toContain("onCellKeyDown(event, rowIndex, colIndex)");
    expect(gradebook).toContain("No students match the selected gradebook scope.");
  });
});

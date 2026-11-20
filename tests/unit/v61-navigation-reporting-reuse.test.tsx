import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, TableRowHead } from "@/components/ui/table";
import { WorkspaceLinkNavigation } from "@/components/workspace/workspace-link-navigation";
import { DirectoryWindowPagination } from "@/components/workspace/directory-window-pagination";

function source(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("V6.1 reporting-table and navigation reuse", () => {
  it("renders row and column header semantics with a focusable horizontal region", () => {
    const html = renderToStaticMarkup(
      <Table scrollLabel="Authorized totals" aria-label="Authorized totals" className="min-w-[40rem]">
        <TableCaption>Site totals, private operator data</TableCaption>
        <TableHeader><TableRow><TableHead scope="col">Site</TableHead><TableHead scope="col">Registered</TableHead></TableRow></TableHeader>
        <TableBody><TableRow><TableRowHead>North Campus</TableRowHead><TableCell>12</TableCell></TableRow></TableBody>
      </Table>,
    );
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Authorized totals"');
    expect(html).toMatch(/tabindex="0"/i);
    expect(html).toContain('scope="col"');
    expect(html).toContain('scope="row"');
    expect(html).toContain("North Campus");
    expect(html).toContain("Site totals, private operator data");
    expect(html).toContain("min-w-[40rem]");
  });

  it.each([
    ["src/components/enrollment/NoncreditNetworkReportPanel.tsx", 3],
    ["src/components/reports/NativeClassReportPanel.tsx", 1],
    ["src/components/learning/NoncreditPilotOutcomesPanel.tsx", 1],
    ["src/components/reports/NoncreditProviderEvidencePanel.tsx", 2],
    ["src/components/workflow/user-flow-map.tsx", 1],
    ["src/routes/canonical.lab.impact.tsx", 1],
    ["src/routes/student.assignments_.$assessmentId.tsx", 1],
  ] as const)("requires canonical table composition in %s", (path, expected) => {
    const content = source(path);
    expect((content.match(/<Table scrollLabel=/g) ?? []).length).toBe(expected);
    expect((content.match(/<TableCaption\b/g) ?? []).length).toBe(expected);
    expect((content.match(/<TableRowHead\b/g) ?? []).length).toBe(expected);
    expect(content).not.toMatch(/<table\b/);
    expect(content).toContain("TableCell");
    expect(content).toContain("TableHeader");
  });

  it("renders related destinations with one labelled navigation landmark", () => {
    const html = renderToStaticMarkup(<WorkspaceLinkNavigation label="Official course records">
      <a href="/class">Class lessons</a><a href="/grades">Grades</a>
    </WorkspaceLinkNavigation>);
    expect(html).toContain('aria-label="Official course records"');
    expect(html).toContain('data-workspace-link-navigation="panel"');
    expect(html.match(/<nav\b/g)).toHaveLength(1);
    expect(html).toContain('href="/class"');
    expect(html).toContain('href="/grades"');
  });

  it("retains lightweight destination navigation without extra panel borders", () => {
    const html = renderToStaticMarkup(<WorkspaceLinkNavigation label="Teaching actions" surface="plain">
      <a href="/assessment">Assessment</a>
    </WorkspaceLinkNavigation>);
    expect(html).toContain('data-workspace-link-navigation="plain"');
    expect(html).not.toContain("bg-card");
  });

  it.each([
    "src/components/learning/RecordedInstructorWorkspace.tsx",
    "src/components/operations/LaunchFamilyProgress.tsx",
    "src/components/operations/LaunchCreatedHandoff.tsx",
    "src/components/teacher/TeacherFirstWeekCard.tsx",
    "src/components/learning/ClassTeacherPlanningPanel.tsx",
    "src/components/operations/LaunchPreparationWorkspace.tsx",
  ])("guards shared destination navigation in %s", path => {
    const content = source(path);
    expect(content).toContain("<WorkspaceLinkNavigation");
    expect(content).not.toMatch(/<nav\b/);
  });

  it("keeps pagination distinct from related destination navigation", () => {
    const blueprint = source("src/components/launch-studio/BlueprintReviewHistoryPanel.tsx");
    const delivery = source("src/components/communication/DeliveryHistory.tsx");
    expect(blueprint).toContain("<DirectoryWindowPagination");
    expect(blueprint).toContain('previousLabel="Newer"');
    expect(delivery).toContain("<PageNavigation");
    expect(blueprint).not.toMatch(/<nav\b/);
    expect(delivery).not.toMatch(/<nav\b/);
    const html = renderToStaticMarkup(<DirectoryWindowPagination label="Blueprint history"
      pageIndex={2} hasMore previousLabel="Newer" nextLabel="Older" onPageChange={() => undefined} />);
    expect(html).toContain("Page 3");
    expect(html).not.toContain(" of ");
  });
});

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OperationsIssueList } from "./OperationsIssueList";

vi.mock("@tanstack/react-router", () => ({
  Link: ({to, params, search: _search, children}: {
    to: string; params?: Record<string,string>; search?: unknown; children: ReactNode;
  }) => <a href={to.replace("$programId", params?.programId ?? "programId")}>{children}</a>,
}));

type Issues = Parameters<typeof OperationsIssueList>[0]["issues"];
const issues = [{ kind: "staffing", sectionId: "section-1", programId: "program-1",
  title: "No verified facilitator", description: "Coverage requires review" }] as unknown as Issues;

describe("shared operations issue list", () => {
  it("shows the same authorized issue and destination in both layouts", () => {
    for(const variant of ["summary","detail"] as const) {
      const html=renderToStaticMarkup(<OperationsIssueList issues={issues} variant={variant}/>);
      expect(html).toContain("No verified facilitator");
      expect(html).toContain("Coverage requires review");
      expect(html).toContain("/launch/school/program-1");
    }
  });
  it("does not manufacture summary issues when none exist", () => {
    expect(renderToStaticMarkup(<OperationsIssueList issues={[]} variant="summary"/>)).toBe("");
  });
});

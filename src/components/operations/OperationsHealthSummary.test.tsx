import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { OperationsHealthSummary } from "./OperationsHealthSummary";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, params, search: _search, children }: {
    to: string; params?: Record<string, string>; search?: unknown; children: ReactNode;
  }) => <a href={to.replace("$programId",params?.programId ?? "programId")}>{children}</a>,
}));

describe("operational health summaries", () => {
  it("renders no operational metrics when the authorized read is unavailable", () => {
    expect(renderToStaticMarkup(<OperationsHealthSummary commandCenterData={null}/>)).toBe("");
  });
  it("uses the same verified exception in both overview and live detail", () => {
    const data = {
      issues: [{kind:"staffing",sectionId:"section-one",programId:"program-one",
        title:"Teacher coverage unresolved",description:"No verified coverage"}],
      summary: {sections:3,unstaffed:1,underCapacity:0,waitlisted:0},
    } as unknown as NonNullable<Parameters<typeof OperationsHealthSummary>[0]["commandCenterData"]>;
    const html=renderToStaticMarkup(<OperationsHealthSummary commandCenterData={data}/>);
    expect((html.match(/Teacher coverage unresolved/g) ?? []).length).toBe(2);
    expect(html).toContain("3 active sections");
    expect(html).toContain("Review workflow");
  });
});

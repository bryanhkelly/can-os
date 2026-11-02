import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PageNavigation } from "@/components/workspace/page-navigation";
import { AdmissionsPageNavigation } from "@/components/admissions/AdmissionsPageNavigation";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, search, children }: { to: string; search: Record<string, string | number>; children: ReactNode }) =>
    <a href={to + "?" + new URLSearchParams(Object.entries(search).map(([key, value]) => [key, String(value)]))}>{children}</a>,
}));

describe("page navigation presentation", () => {
  it("renders noninteractive boundary indicators without inventing links", () => {
    const html = renderToStaticMarkup(<PageNavigation label="Records" showUnavailable><span>Page 1</span></PageNavigation>);
    expect(html).toContain('aria-label="Records"');
    expect(html.match(/aria-disabled="true"/g)).toHaveLength(2);
    expect(html).not.toContain("<a");
    expect(html).not.toContain("<button");
  });
  it("hides unavailable controls when the route has no total-page contract", () => {
    const html = renderToStaticMarkup(<PageNavigation label="Records" next={<a href="?page=2">More records</a>}/>);
    expect(html).toContain('href="?page=2"');
    expect(html).not.toContain("Previous");
    expect(html).not.toContain("aria-disabled");
  });
  it.each(["applications", "students"] as const)("preserves independent intake selections for %s", kind => {
    const html = renderToStaticMarkup(<AdmissionsPageNavigation kind={kind} hasMore selection={{
      application: "application", siteId: "school", programId: "program", interest: "interest",
      page: 3, studentPage: 5, search: "Jordan Smith",
    }}/>);
    const field = kind === "students" ? "studentPage" : "page";
    const previous = kind === "students" ? 4 : 2;
    const next = kind === "students" ? 6 : 4;
    expect(html).toContain(`${field}=${previous}`);
    expect(html).toContain(`${field}=${next}`);
    for (const parameter of ["application=application", "siteId=school", "programId=program", "interest=interest", "search=Jordan+Smith"]) {
      expect(html).toContain(parameter);
    }
    expect(html).toContain(kind === "students" ? "page=3" : "studentPage=5");
  });
  it("preserves first/last boundary visibility for intake", () => {
    const html = renderToStaticMarkup(<AdmissionsPageNavigation kind="applications" hasMore={false} selection={{}}/>);
    expect(html).toContain("Admissions page 1");
    expect(html).not.toContain("<a");
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { LocalSiteDelegationPanel } from "@/components/operations/LocalSiteDelegationPanel";
import { SectionFacilitatorPanel } from "@/components/operations/SectionFacilitatorPanel";
import { SiteStaffingFeedback } from "@/components/operations/SiteStaffingFeedback";
import { QueryState } from "@/components/workspace";
import { siteStaffingKeys } from "@/modules/operations/site-staffing.queries";

vi.mock("@/modules/operations/site-local-delegation.functions", () => ({
  getLocalSiteDelegations: vi.fn(), changeLocalSiteDelegation: vi.fn(),
}));
vi.mock("@/modules/operations/site-section-facilitators.functions", () => ({
  getSectionFacilitatorPlanning: vi.fn(), updateSectionFacilitator: vi.fn(),
}));

describe("staffing panels use shared query presentation", () => {
  it("shows pending reads without appointment controls", () => {
    const client = new QueryClient();
    const html = renderToStaticMarkup(<QueryClientProvider client={client}>
      <LocalSiteDelegationPanel programId="a"/>
      <SectionFacilitatorPanel programId="a"/>
    </QueryClientProvider>);
    expect(html).toContain("Loading Site staff assignments");
    expect(html).toContain("Loading class staffing");
    expect(html).not.toContain("<select");
    client.clear();
  });
  it("never renders a previous Program's cached staff for a different Program", () => {
    const client = new QueryClient();
    client.setQueryData(siteStaffingKeys.localDelegations("a"), {
      hasConfiguration: true, responsibilities: [],
      candidates: [{ personId: "private-a", role: "site_leader", firstName: "PrivateA", lastName: "Director" }],
    });
    const html = renderToStaticMarkup(<QueryClientProvider client={client}>
      <LocalSiteDelegationPanel programId="b"/>
    </QueryClientProvider>);
    expect(html).toContain("Loading Site staff assignments");
    expect(html).not.toContain("PrivateA");
    expect(html).not.toContain("private-a");
    client.clear();
  });
  it("renders both existing domain-specific forms from their respective read models", () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    client.setQueryData(siteStaffingKeys.localDelegations("a"), {
      hasConfiguration: true, responsibilities: [],
      candidates: [{ personId: "director", role: "site_leader", firstName: "Alex", lastName: "Director" }],
    });
    client.setQueryData(siteStaffingKeys.sectionFacilitators("a"), {
      hasConfiguration: true,
      sections: [{ id: "math", code: "MATH", title: "Algebra" }],
      appointments: [],
      staff: [{ personId: "facilitator", first: "Pat", last: "Facilitator" }],
    });
    const html = renderToStaticMarkup(<QueryClientProvider client={client}>
      <LocalSiteDelegationPanel programId="a"/>
      <SectionFacilitatorPanel programId="a"/>
    </QueryClientProvider>);
    expect(html).toContain("Alex Director");
    expect(html).toContain("Pat Facilitator");
    expect(html).toContain("Algebra");
    expect(html).toContain("Add Section facilitator");
    expect(html).toContain('data-action-footer="inline"');
    client.clear();
  });
});

describe("shared Site staffing command feedback", () => {
  const base = { onRetry: () => undefined, busy: false };
  it("shows command errors in danger without implying a successful save", () => {
    const html=renderToStaticMarkup(<SiteStaffingFeedback {...base} error="Not authorized" />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("border-danger/50");
    expect(html).not.toContain("Refresh staffing");
    expect(html).not.toContain("saved");
  });
  it("shows saved changes in success only when refresh succeeded", () => {
    const html=renderToStaticMarkup(<SiteStaffingFeedback {...base} notice="Appointment recorded" />);
    expect(html).toContain('role="status"');
    expect(html).toContain("border-success/50");
    expect(html).not.toContain("Refresh staffing");
  });
  it("shows exactly one attention warning after a saved command could not refresh", () => {
    const html=renderToStaticMarkup(<SiteStaffingFeedback {...base}
      notice="Appointment recorded" refreshWarning="Saved, but records could not refresh." />);
    expect(html).toContain("Appointment recorded");
    expect(html).toContain("Saved, but records could not refresh.");
    expect(html).toContain("border-warning/50");
    expect(html).not.toContain("border-success/50");
    expect(html.match(/role="alert"/g)).toHaveLength(1);
    expect(html.match(/Refresh staffing/g)).toHaveLength(1);
    expect(html).toContain('type="button"');
  });
  it("locks repeat retries while the current refresh is busy", () => {
    const html=renderToStaticMarkup(<SiteStaffingFeedback {...base}
      refreshWarning="Saved but stale" busy />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('disabled=""');
    expect(html).toContain("animate-spin");
  });
});

describe("QueryState retry", () => {
  it("keeps error content exclusive and provides an explicit retry button", () => {
    const html = renderToStaticMarkup(<QueryState error="Unavailable" onRetry={() => {}}>
      <button>Must not be actionable</button>
    </QueryState>);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Retry");
    expect(html).not.toContain("Must not be actionable");
  });
  it("disables retry while it is already in progress", () => {
    const html = renderToStaticMarkup(<QueryState error="Unavailable" onRetry={() => {}} retrying/>);
    expect(html).toContain("Retrying");
    expect(html).toContain('disabled=""');
  });
  it("preserves loading-before-error precedence", () => {
    const html = renderToStaticMarkup(<QueryState loading="Loading staff" error="Unavailable" onRetry={() => {}}/>);
    expect(html).toContain("Loading staff");
    expect(html).not.toContain("Unavailable");
    expect(html).not.toContain("<button");
  });
});

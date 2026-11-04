import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DashboardLayout, DashboardPanel, DashboardShortcut } from "@/components/workspace/dashboard-layout";
import { RecordHeader, RecordLayout, EntityCard } from "@/components/workspace/record-layout";
import { WorkflowWorkspace, WorkflowProgress } from "@/components/workflow/workflow-workspace";
import { UserFlowMap } from "@/components/workflow/user-flow-map";

describe("V6.1 reusable design system", () => {
  it("keeps a role dashboard's wallpaper independent from action panels and rail", () => {
    const html = renderToStaticMarkup(<DashboardLayout wallpaper={<div>Campaign artwork</div>}
      quickActions={<DashboardShortcut title="Classes" description="My sections"><a href="/classes" /></DashboardShortcut>}
      primary={<DashboardPanel title="Today's work"><p>Next assignment</p></DashboardPanel>}
      rail={<DashboardPanel title="Calendar"><p>Today</p></DashboardPanel>} />);
    expect(html).toContain("Campaign artwork");
    expect(html).toContain('aria-label="Dashboard shortcuts"');
    expect(html).toContain('href="/classes"');
    expect(html).toContain('aria-label="Dashboard calendar and updates"');
    expect(html).toContain("Next assignment");
  });

  it("makes selected records visible without a dashboard above them", () => {
    const html = renderToStaticMarkup(<RecordLayout
      header={<RecordHeader title="Avery Kelly" eyebrow="Application" status={<span>Needs review</span>} />}
      main={<p>Guardian verification</p>} rail={<p>Review owner</p>} />);
    expect(html).toContain("Avery Kelly");
    expect(html.indexOf("Avery Kelly")).toBeLessThan(html.indexOf("Guardian verification"));
    expect(html).toContain("Needs review");
    expect(html).toContain('aria-label="Related record context"');
  });

  it("keeps directory cards as actual links with accessible record labels", () => {
    const html = renderToStaticMarkup(<EntityCard title="Valor Academy" href="/sites/valor" meta="Pacific">School site</EntityCard>);
    expect(html).toContain('href="/sites/valor"');
    expect(html).toContain("Valor Academy");
    expect(html).toContain("School site");
  });

  it("shows explicit stage names and blocked-state text for workspaces", () => {
    const steps = [
      { id: "first", label: "Inquiry", state: "complete" as const },
      { id: "second", label: "Review guardian", state: "current" as const },
      { id: "third", label: "Opening decision", state: "blocked" as const },
    ];
    const html = renderToStaticMarkup(<WorkflowWorkspace title="Launch application" steps={steps}
      details={<p>Current evidence</p>} actions={<button>Open review</button>} />);
    expect(html).toContain("Launch application");
    expect(html).toContain("Review guardian");
    expect(html).toContain("Blocked");
    expect(html).toContain("Current evidence");
    expect(html).toContain('aria-label="Available next actions"');
  });

  it("marks only actionable stages as links", () => {
    const html = renderToStaticMarkup(<WorkflowProgress steps={[
      { id: "review", label: "Evidence", state: "current", href: "/review" },
      { id: "approved", label: "Institutional authorization", state: "upcoming" },
    ]} />);
    expect(html).toContain('href="/review"');
    expect(html).toContain("Institutional authorization");
    expect((html.match(/<a /g) ?? []).length).toBe(1);
  });

  it("makes a diagram a read-only explanation of decisions and ownership", () => {
    const html = renderToStaticMarkup(<UserFlowMap title="Church launch journey" stages={[{
      id: "setup", title: "Setup", nodes: [
        { id: "interest", title: "Church interested", kind: "entry", owner: "Church" },
        { id: "review", title: "Review evidence", kind: "decision", state: "blocked", owner: "CAN" },
      ],
    }]} transitions={[{ from: "interest", to: "review", outcome: "Submitted" }, { from: "review", to: "interest", outcome: "Rejected", condition: "Request correction" }]} />);
    expect(html).toContain("Church launch journey");
    expect(html).toContain("Decision");
    expect(html).toContain("Blocked");
    expect(html).toContain("Owner: CAN");
    expect(html).toContain("Transitions and decision branches");
    expect(html).toContain("Rejected");
    expect(html).not.toContain("<button");
  });
});

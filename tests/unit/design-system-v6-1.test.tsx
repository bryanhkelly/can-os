import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RosterList } from "@/components/workspace/roster-list";
import { WorkspacePanel, StatusBadge, PersonMark } from "@/components/workspace/workspace-panel";
import { DashboardLayout, DashboardPanel, DashboardShortcut } from "@/components/workspace/dashboard-layout";
import { RecordHeader, RecordLayout, RecordFacts, EntityCard } from "@/components/workspace/record-layout";
import { WorkflowWorkspace, WorkflowProgress } from "@/components/workflow/workflow-workspace";
import { UserFlowMap } from "@/components/workflow/user-flow-map";
import { MasterDetailWorkspace, MasterDetailListItem } from "@/components/workspace/master-detail-workspace";
import { DashboardProgress, DashboardTimeline, DashboardPreviewList, DashboardMediaTile } from "@/components/workspace/dashboard-widgets";

describe("V6.1 reusable design system", () => {
  it("renders shared workspace presentation without rounded geometry", () => {
    const panel = renderToStaticMarkup(<WorkspacePanel title="Class roster"><p>Current participants</p></WorkspacePanel>);
    const status = renderToStaticMarkup(<StatusBadge tone="success">Verified</StatusBadge>);
    const person = renderToStaticMarkup(<PersonMark name="Jordan Lee"/>);
    for (const html of [panel, status, person]) {
      expect(html).not.toMatch(/rounded(?:-|\\s|")/);
    }
    expect(panel).toContain('aria-label="Class roster"');
    expect(status).toContain("Verified");
    expect(person).toContain("JL");
  });

  it("renders roster rows without owning enrollment or authorization rules", () => {
    const rows = [{ id: "enrollment-1", name: "Jordan Lee", status: "active" }];
    const html = renderToStaticMarkup(<RosterList rows={rows} rowKey={row => row.id}
      primary={row => row.name} detail={row => row.status}
      actions={row => <a href={`/learn/${row.id}`}>Open activity</a>}/>);
    expect(html).toContain('aria-label="Class roster"');
    expect(html).toContain("Jordan Lee");
    expect(html).toContain("active");
    expect(html).toContain('href="/learn/enrollment-1"');
    expect(html).not.toContain("rounded");
    const empty = renderToStaticMarkup(<RosterList rows={[]} rowKey={() => ""}
      primary={() => null} emptyMessage="No authorized enrollments."/>);
    expect(empty).toContain("No authorized enrollments.");
    expect(empty).not.toContain("<ul");
  });

  it("keeps Blueprint decisions and Section lifecycle statuses on the shared presentation contract", () => {
    const sourcePaths = [
      "src/routes/canonical.blueprint-reviews.tsx",
      "src/components/launch-studio/CanonicalBlueprintWorkspace.tsx",
      "src/components/operations/SectionLifecycleManager.tsx",
    ];
    for (const path of sourcePaths) {
      const source = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
      expect(source).toContain("<StatusBadge");
      expect(source).not.toMatch(/rounded(?:-xl|-lg|-full)/);
    }
    const reviewer = readFileSync(new URL("../../src/routes/canonical.blueprint-reviews.tsx", import.meta.url), "utf8");
    expect(reviewer).toContain("No operating permission was granted");
    const launch = readFileSync(new URL("../../src/components/launch-studio/CanonicalBlueprintWorkspace.tsx", import.meta.url), "utf8");
    expect(launch).toContain("planning-only");
  });

  it("composes native enrolled-Class lifecycle controls from shared primitives", () => {
    const route = readFileSync(new URL("../../src/routes/class.tsx", import.meta.url), "utf8");
    const start = route.indexOf("function EnrolledClassCard(");
    const end = route.indexOf("function NativeLearnerClasses", start);
    const component = route.slice(start, end);
    expect(component).toContain("<StatusBadge");
    expect(component).toContain("<Select");
    expect(component).toContain("<Checkbox");
    expect(component).not.toMatch(/<(?:select|input)\b/);
    expect(component).toContain("withdrawMyNativeClassEnrollment");
    expect(component).toContain("transferMyNativeClassEnrollment");
  });

  it("loads the same V6.1 fonts in the app and Storybook", () => {
    const root = readFileSync(new URL("../../src/routes/__root.tsx", import.meta.url), "utf8");
    const preview = readFileSync(new URL("../../.storybook/preview-head.html", import.meta.url), "utf8");
    for (const source of [root, preview]) {
      expect(source).toContain("family=DM+Sans:wght@400;500;600;700");
      expect(source).toContain("family=Instrument+Serif:ital@0;1");
    }
  });

  it("keeps a role dashboard's wallpaper independent from action panels and rail", () => {
    const html = renderToStaticMarkup(<DashboardLayout wallpaper={<div>Campaign artwork</div>}
      quickActions={<DashboardShortcut title="Classes" description="My Classes"><a href="/class" /></DashboardShortcut>}
      primary={<DashboardPanel title="Today's work"><p>Next assignment</p></DashboardPanel>}
      rail={<DashboardPanel title="Calendar"><p>Today</p></DashboardPanel>} />);
    expect(html).toContain("Campaign artwork");
    expect(html).toContain('aria-label="Dashboard shortcuts"');
    expect(html).toContain('href="/class"');
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

  it("renders authorized record facts as a semantic, labeled, responsive definition list", () => {
    const html = renderToStaticMarkup(<RecordFacts label="Application facts" columns={3}
      items={[
        { id: "site", label: "Site", value: "Valor Academy" },
        { id: "program", label: "Program", value: <strong>Summer enrichment</strong> },
        { id: "status", label: "Status", value: "Awaiting review" },
      ]}/>);
    expect(html).toContain('<dl aria-label="Application facts"');
    expect(html).toContain("sm:grid-cols-3");
    expect((html.match(/<dt\b/g) ?? []).length).toBe(3);
    expect((html.match(/<dd\b/g) ?? []).length).toBe(3);
    expect(html).toContain("<strong>Summer enrichment</strong>");
    expect(html.indexOf("Site")).toBeLessThan(html.indexOf("Awaiting review"));
    expect(html).not.toMatch(/\brounded(?:-[\w-]+)?\b/);
  });

  it("renders concise record evidence as square labeled tiles", () => {
    const html = renderToStaticMarkup(<RecordFacts columns={3} variant="tiles"
      label="Supervision facts" items={[
        { id: "expected", label: "Expected onsite", value: "Not confirmed" },
        { id: "staffing", label: "Reviewed staffing plan", value: "Ready" },
        { id: "attendance", label: "Observed attendance", value: "Not yet observable" },
      ]}/>);
    expect(html).toContain('aria-label="Supervision facts"');
    expect(html).toContain("sm:grid-cols-3");
    expect((html.match(/border border-border bg-card p-3/g) ?? []).length).toBe(3);
    expect(html).toContain("Not yet observable");
    expect(html).not.toMatch(/\brounded(?:-[\w-]+)?\b/);
  });

  it("supports a single-column record fact list and an empty safe result", () => {
    const html = renderToStaticMarkup(<RecordFacts columns={1}
      items={[{label:"Opening state", value:"Draft"}]}/>);
    expect(html).toContain("<dl");
    expect(html).not.toContain("sm:grid-cols-2");
    expect(html).not.toContain("sm:grid-cols-3");
    expect(renderToStaticMarkup(<RecordFacts items={[]}/>)).toBe("");
  });

  it("names the available record actions and scope-specific rail/activity", () => {
    const html = renderToStaticMarkup(<RecordLayout
      header={<RecordHeader title="Site details" status={<span>Draft</span>}
        actions={<button type="button">Review site</button>}/>}
      main={<p>Current site data</p>}
      rail={<p>Next step</p>} railLabel="Site compliance context"
      activity={<p>Reviewed yesterday</p>} activityLabel="Site review history"/>);
    expect(html).toContain('role="group" aria-label="Record actions"');
    expect(html).toContain('aria-label="Site compliance context"');
    expect(html).toContain('aria-label="Site review history"');
    expect(html).toContain("Review site");
    expect(html).toContain("Reviewed yesterday");
  });

  it("supports semantic rich metadata in a linked entity card without nested spans", () => {
    const html = renderToStaticMarkup(<EntityCard title="Community learning center"
      href="/sites/center-1"
      meta={<><p>Summer programs</p><p>Enrollment pending approval</p></>}>
      This is a record link, not an enrollment confirmation.
    </EntityCard>);
    expect(html).toContain('href="/sites/center-1"');
    expect(html).toContain("<p>Summer programs</p>");
    expect(html).toContain("<p>Enrollment pending approval</p>");
    expect(html).not.toContain('<span class="min-w-0 text-muted-foreground"><p>');
  });

  it("migrates Action and enrichment record metadata without duplicating tables", () => {
    for (const path of ["src/routes/actions.$actionId.tsx", "src/routes/enrichment_.$seasonId.tsx"]) {
      const source = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
      expect(source).toContain("<RecordHeader");
      expect(source).toContain("<RecordLayout");
      expect(source).toContain("<RecordFacts");
      expect(source).not.toMatch(/<dl\b/);
    }
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

  it("supports URL-owned master/detail selection without burying the chosen record", () => {
    const html = renderToStaticMarkup(<MasterDetailWorkspace title="Admissions queue" mobileMode="detail"
      list={<MasterDetailListItem title="Avery Kelly" selected href="?application=avery" />}
      detail={<h2>Guardian verification</h2>} />);
    expect(html).toContain('aria-label="Records in queue"');
    expect(html).toContain('aria-label="Selected record details"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('href="?application=avery"');
    expect(html).toContain("Guardian verification");
  });

  it("does not invent progress for unknown values and maintains accessible schedule semantics", () => {
    const invalid = renderToStaticMarkup(<DashboardProgress label="Course progress" value={-1} max={0} />);
    expect(invalid).toContain("Progress cannot be verified");
    expect(invalid).not.toContain('role="progressbar"');
    const valid = renderToStaticMarkup(<DashboardProgress label="Lesson completion" value={3} max={8} />);
    expect(valid).toContain('aria-valuenow="3"');
    expect(valid).toContain('aria-valuemax="8"');
    const timeline = renderToStaticMarkup(<DashboardTimeline entries={[{ id: "a", time: "9:00 AM", title: "English" }]} />);
    expect(timeline).toContain("<time");
    const empty = renderToStaticMarkup(<DashboardPreviewList items={[]} />);
    expect(empty).toContain('role="status"');
  });

  it("keeps all visible media-tile text in its accessible name", () => {
    const tile = <DashboardMediaTile title="School life" subtitle="Community events" href="/events" />;
    expect(renderToStaticMarkup(tile)).not.toContain("aria-label=");
    const labelled = renderToStaticMarkup(<DashboardMediaTile title="School life"
      subtitle="Community events" label="Published stories" href="/events" />);
    expect(labelled).toContain('aria-label="School life Community events Published stories"');
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

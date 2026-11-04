import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { BookOpen, CalendarDays, ClipboardList, MessageCircle } from "lucide-react";
import { DashboardHome } from "./dashboard-home";
import { DashboardPanel, DashboardShortcut } from "./dashboard-layout";
import { StatCard } from "./stat-card";
import { WorkspaceNotice } from "./notice";

const meta = {
  title: "V6.1 templates/Shared dashboard homes",
  component: DashboardHome,
  parameters: { layout: "fullscreen" },
  args: {
    title: "Your teaching day, Avery.",
    eyebrow: "CAN OS · Teacher",
    subtitle: "Your sections, grading queue, and missing work across your school today.",
    shortcuts: <>
      <DashboardShortcut title="My classes" description="Open assigned sections" icon={<BookOpen className="size-5" />}><a href="#classes" /></DashboardShortcut>
      <DashboardShortcut title="Work queue" description="Review authorized next steps" icon={<ClipboardList className="size-5" />}><a href="#work" /></DashboardShortcut>
      <DashboardShortcut title="Calendar" description="Your authorized schedule" icon={<CalendarDays className="size-5" />}><a href="#schedule" /></DashboardShortcut>
      <DashboardShortcut title="Messages" description="Workspace conversations" icon={<MessageCircle className="size-5" />}><a href="#connections" /></DashboardShortcut>
    </>,
    children: <>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Assigned sections" value={2} hint="Isolated illustrative fixture" />
        <StatCard label="Work awaiting review" value={3} hint="Isolated illustrative fixture" />
        <StatCard label="Follow-ups" value={1} hint="Isolated illustrative fixture" />
      </div>
      <DashboardPanel title="What needs you next" id="work">
        <p className="text-sm">Review a submitted assignment in your assigned section.</p>
        <a href="#classes" className="mt-3 inline-block text-sm text-primary underline">Open review →</a>
      </DashboardPanel>
      <DashboardPanel title="Assigned sections" id="classes">
        <div className="grid gap-3 sm:grid-cols-2">
          {["English Literature", "Algebra II"].map(title => <article key={title} className="border p-4">
            <h3 className="font-serif text-xl">{title}</h3>
            <p className="mt-2 text-xs text-muted-foreground">Synthetic component fixture; no server authority.</p>
          </article>)}
        </div>
      </DashboardPanel>
    </>,
    rail: <DashboardPanel title="Today's schedule" id="schedule">
      <p className="text-xs text-muted-foreground">No events in this isolated fixture. Production routes retain their authorized calendar readers.</p>
    </DashboardPanel>,
    actions: <a id="connections" href="#work">Review workspace follow-ups →</a>,
  },
} satisfies Meta<typeof DashboardHome>;
export default meta;
type Story = StoryObj<typeof meta>;

function roleContent(first: string, second: string) {
  return {
    shortcuts: <>
      <DashboardShortcut title={first} description="Your authorized work" icon={<ClipboardList className="size-5" />}><a href="#role-work" /></DashboardShortcut>
      <DashboardShortcut title={second} description="Your workspace records" icon={<BookOpen className="size-5" />}><a href="#role-records" /></DashboardShortcut>
      <DashboardShortcut title="Calendar" description="Your authorized schedule" icon={<CalendarDays className="size-5" />}><a href="#schedule" /></DashboardShortcut>
      <DashboardShortcut title="Messages" description="Workspace conversations" icon={<MessageCircle className="size-5" />}><a href="#connections" /></DashboardShortcut>
    </>,
    children: <>
      <DashboardPanel title={first} id="role-work"><p className="text-sm">No pending work in this isolated fixture. Production routes display their existing authorized records.</p></DashboardPanel>
      <DashboardPanel title={second} id="role-records"><p className="text-sm">Records are scoped by the owning service, not by the dashboard presentation.</p></DashboardPanel>
    </>,
    actions: <a id="connections" href="#role-work">Review workspace follow-ups →</a>,
  };
}

export const Teacher: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("main")).toHaveLength(1);
    await expect(canvas.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    await expect(canvas.getByRole("navigation", { name: "Dashboard shortcuts" })).toBeVisible();
    const link = canvas.getByRole("link", { name: /My classes/ });
    link.focus();
    await userEvent.tab();
    await expect(canvas.getByRole("link", { name: /Work queue/ })).toHaveFocus();
    await expect(canvas.getByRole("heading", { name: "Today's schedule" })).toBeVisible();
  },
};
export const Family: Story = { args: { title: "Family home", eyebrow: "CAN OS · Family",
  subtitle: "Your children, enrollment steps, and school follow-ups in one place.",
  ...roleContent("Needs your attention", "Children & academics") } };
export const Operations: Story = { args: { title: "Needs You", eyebrow: "CAN OS · School operations",
  subtitle: "Review actions and school launch readiness within your authorized scope.",
  ...roleContent("Action queue", "School launches") } };
export const SiteLeader: Story = { args: { title: "Synthetic school", eyebrow: "CAN OS · Site Operations",
  subtitle: "Opening decisions, staffing, student exceptions and school records.",
  ...roleContent("School operations", "Admissions"),
  priority: <WorkspaceNotice tone="danger">School opening is not currently authorized. Verify authority before receiving students.</WorkspaceNotice> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const warning = canvas.getByRole("alert");
    const hero = canvas.getByRole("region", { name: "Dashboard overview" });
    await expect(warning).toBeVisible();
    await expect(warning.compareDocumentPosition(hero) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  },
};
export const OnsiteStaff: Story = { args: { title: "Site Today", eyebrow: "CAN OS · Onsite school",
  subtitle: "Physical presence, staff coverage, verified pickup, and reconciliation.",
  ...roleContent("Staff coverage", "Attendance"),
  priority: <WorkspaceNotice tone="danger">Opening verification unavailable. Attendance does not authorize operation or student release.</WorkspaceNotice> } };
export const Specialist: Story = { args: { title: "Specialist caseload", eyebrow: "CAN OS · Student support",
  subtitle: "Authorized referrals, support plans, insights and actions.",
  ...roleContent("Caseload", "Referrals & plans") } };
export const Counselor: Story = { args: { title: "Counselor caseload", eyebrow: "CAN OS · Student support",
  subtitle: "Named-case support and school follow-ups.",
  ...roleContent("Caseload", "Referrals & plans") } };
export const NetworkPartner: Story = { args: { title: "Synthetic denomination", eyebrow: "CAN OS · Network partner",
  subtitle: "Affiliation does not grant access to student academic records.",
  ...roleContent("Affiliations", "Locations") } };
export const NetworkSteward: Story = { args: { title: "Church onboarding and partner contracts", eyebrow: "CAN OS · Network partnerships",
  subtitle: "Verify partner authority. School opening remains separately authorized.",
  ...roleContent("Church applications", "Contracts") } };

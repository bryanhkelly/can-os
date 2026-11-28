import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/components/ui/button";
import { EmptyState } from "./empty-state";
import { StatCard } from "./stat-card";
import { StatusBadge, WorkspacePanel } from "./workspace-panel";
import { WorkspaceShell } from "./workspace-shell";

const meta = { title: "07 Persona experiences/Role workspaces" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const FamilyHome: Story = {
  render: () => <WorkspaceShell eyebrow="Family" title="Good morning, Avery's family"
    subtitle="One place for the next authorized family actions.">
    <div className="grid gap-4 sm:grid-cols-3"><StatCard label="Needs you" value="2" /><StatCard label="Today's classes" value="5" /><StatCard label="Unread messages" value="1" /></div>
    <WorkspacePanel title="Needs you" description="Exact student and school context" className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-4"><div><StatusBadge tone="attention">Signature needed</StatusBadge><p className="mt-3 font-medium">Enrollment consent · Avery</p></div><Button>Open requirement</Button></div>
    </WorkspacePanel>
  </WorkspaceShell>,
};

export const TeacherWorkspace: Story = {
  render: () => <WorkspaceShell eyebrow="Teaching" title="Today's teaching workspace"
    subtitle="Assigned sections and server-authorized follow-up.">
    <WorkspacePanel title="First lesson" description="Biology · Period 2"><p className="text-sm text-muted-foreground">Published lesson content and the assigned class roster.</p></WorkspacePanel>
  </WorkspaceShell>,
};

export const SchoolOperator: Story = {
  render: () => <WorkspaceShell eyebrow="Operations" title="School operations"
    subtitle="Canonical readiness without synthetic approval indicators." width="wide">
    <div className="grid gap-4 sm:grid-cols-3"><StatCard label="Active programs" value="3" /><StatCard label="Open reviews" value="7" /><StatCard label="Blocked openings" value="1" /></div>
    <WorkspacePanel title="Opening readiness" className="mt-6"><EmptyState title="No opening selected." description="Choose an authorized site and program to inspect its requirements." /></WorkspacePanel>
  </WorkspaceShell>,
};

/** Synthetic composition examples; not claims of deployed permissions or data. */
function RoleFixture({role,summary,metrics,priority,detail}:{
  role:string;summary:string;metrics:readonly {label:string;value:string}[];priority:string;detail:string;
}){
  return <WorkspaceShell eyebrow={role} title={role+" workspace"} subtitle={summary} width="wide">
    <div className="grid gap-4 sm:grid-cols-3">{metrics.map(metric=><StatCard key={metric.label} {...metric}/>)}</div>
    <WorkspacePanel title={priority} className="mt-6"><p className="text-sm text-muted-foreground">{detail}</p></WorkspacePanel>
  </WorkspaceShell>;
}
export const AdultLearner: Story={render:()=> <RoleFixture role="Adult learner" summary="Short programs, progress and earned credentials." metrics={[{label:"In progress",value:"1"},{label:"Completed",value:"2"},{label:"Credentials",value:"1"}]} priority="Continue learning" detail="Digital skills workshop, session 2 of 4."/>};
export const Facilitator: Story={render:()=> <RoleFixture role="Facilitator" summary="Assigned sessions and attendance." metrics={[{label:"Sessions today",value:"2"},{label:"Expected participants",value:"18"},{label:"Attendance to reconcile",value:"1"}]} priority="Next session" detail="Review your assigned group and playback readiness."/>};
export const SiteOperator: Story={render:()=> <RoleFixture role="Site operator" summary="Local operations and preparation." metrics={[{label:"Active offerings",value:"3"},{label:"Upcoming events",value:"2"},{label:"Needs attention",value:"4"}]} priority="Prepare the next offering" detail="Review required evidence and assigned facilitators."/>};
export const OrganizationLeader: Story={render:()=> <RoleFixture role="Organization leader" summary="Authorized Site performance." metrics={[{label:"Sites",value:"8"},{label:"Participants",value:"230"},{label:"Open reviews",value:"5"}]} priority="Site readiness" detail="Review the Sites that have requested assistance."/>};
export const NationalPartner: Story={render:()=> <RoleFixture role="National partner" summary="Consented, aggregated network outcomes." metrics={[{label:"Reporting Sites",value:"42"},{label:"Participant hours",value:"875"},{label:"Verified completions",value:"310"}]} priority="Network reach" detail="Compare authorized reporting Sites and programs."/>};
export const ContentPublisher: Story={render:()=> <RoleFixture role="Content publisher" summary="Drafts, release review and distribution." metrics={[{label:"Drafts",value:"4"},{label:"Awaiting review",value:"2"},{label:"Published versions",value:"9"}]} priority="Release preparation" detail="Review evidence and version requirements."/>};
export const Sponsor: Story={render:()=> <RoleFixture role="Sponsor" summary="Approved aggregate impact, never private learner records." metrics={[{label:"Supported Sites",value:"12"},{label:"Participant hours",value:"540"},{label:"Reporting period",value:"Q4"}]} priority="Impact report" detail="View the approved aggregate metrics for your sponsorship."/>};
export const PlatformAdministrator: Story={render:()=> <RoleFixture role="Platform administrator" summary="Operational health and delegated authority." metrics={[{label:"Open work items",value:"12"},{label:"Integration alerts",value:"2"},{label:"Reviews due",value:"3"}]} priority="Requires attention" detail="Resolve authorized platform issues through their owning workflows."/>};

import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { EmptyState, WorkspacePanel } from "@/components/workspace";
import { formatTimestamp } from "@/modules/calendar/timezone";
import { groupKindLabel, type StudyGroupRecord } from "@/domain/study-group-display";
import type { getCanonicalGroupWorkspace } from "@/modules/study-groups/canonical-workspace.functions";

type StudyGroupWorkspace = Awaited<ReturnType<typeof getCanonicalGroupWorkspace>>;

/** Source-authorized study group presentation; neither resources nor a
 * scheduled meeting implies membership, attendance, or completed coursework.
 */
export function GroupOverviewPanel({ group, next }: { group: StudyGroupRecord; next: StudyGroupRecord["sessions"][number] | null }) {
  const dateParts = next ? new Intl.DateTimeFormat("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: group.timezone,
  }).formatToParts(new Date(next.startsAt)) : [];
  const weekday = dateParts.find(part => part.type === "weekday")?.value;
  const month = dateParts.find(part => part.type === "month")?.value;
  const day = dateParts.find(part => part.type === "day")?.value;
  return <div className="space-y-5">
    <WorkspacePanel className="shadow-none" title="Our focus this week"
      description="Start with the facilitator's session agenda and group description.">
      <div className="border-l-2 border-primary pl-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Session focus</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
          {next?.agenda || group.description || "The facilitator has not shared a focus or agenda yet."}
        </p>
      </div>
    </WorkspacePanel>
    <WorkspacePanel className="shadow-none" title="Upcoming study sessions"
      description="Plan ahead and come prepared to contribute.">
      {next ? <div className="grid gap-3 border-b border-border py-2 sm:grid-cols-[5rem_minmax(0,1fr)] sm:items-center">
        <div className="border border-border px-3 py-2 text-center">
          <p className="text-xs font-semibold uppercase text-muted-foreground">{weekday} · {month}</p>
          <p className="text-xl font-semibold tabular-nums">{day}</p>
        </div>
        <div>
          <h3 className="text-sm font-semibold">{next.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatTimestamp(next.startsAt, group.timezone)} – {formatTimestamp(next.endsAt, group.timezone)}
            {next.location ? ` · ${next.location}` : " · Location to be confirmed"}
          </p>
          {next.agenda && <p className="mt-2 text-sm leading-6">{next.agenda}</p>}
        </div>
      </div> : <EmptyState title="No sessions scheduled yet."
        description="The facilitator has not scheduled a study session for this group." />}
    </WorkspacePanel>
  </div>;
}

export function GroupDetailsPanel({ group }: { group: StudyGroupRecord }) {
  return <WorkspacePanel className="shadow-none" title="Study group details">
    <dl className="grid grid-cols-[minmax(6rem,0.8fr)_minmax(0,1.2fr)] gap-x-3 gap-y-3 text-sm">
      <dt className="text-muted-foreground">Group type</dt><dd className="m-0 font-medium">{groupKindLabel(group.kind)}</dd>
      <dt className="text-muted-foreground">Facilitator</dt><dd className="m-0 font-medium">{group.facilitatorName}</dd>
      <dt className="text-muted-foreground">Members</dt>
      <dd className="m-0 font-medium">{group.memberCount} of {group.maxMembers}</dd>
      <dt className="text-muted-foreground">Time zone</dt><dd className="m-0 font-medium">{group.timezone}</dd>
    </dl>
    <p className="mt-5 border-l-2 border-primary bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">
      Share ideas respectfully, listen to one another, and contact a trusted adult or school staff directly about urgent safety concerns.
    </p>
  </WorkspacePanel>;
}

export function GroupResourcesPanel({group, approvedMember, role}: {
  group: StudyGroupRecord; approvedMember: boolean; role: StudyGroupWorkspace["role"];
}) {
  return <WorkspacePanel className="shadow-none" title="Shared learning resources"
    description="Open existing class materials instead of keeping a separate copy in study groups.">
    {approvedMember && group.sectionId ? <nav aria-label="Class learning resources" className="flex flex-wrap gap-3">
      <Button asChild variant="outline"><Link to="/classes" search={{section: group.sectionId, tab: "lessons"}}>
        Open class lessons
      </Link></Button>
      {role === "student" && <Button asChild variant="outline"><Link to="/student/assignments" search={{section: group.sectionId}}>
        View class assignments
      </Link></Button>}
    </nav> : <EmptyState title={approvedMember ? "No class resources linked" : "Join to access shared resources"}
      description={approvedMember
        ? "This interest group is not linked to a class. Ask your facilitator to share materials through an authorized class workspace."
        : "Group learning materials are available after membership approval."} />}
  </WorkspacePanel>;
}


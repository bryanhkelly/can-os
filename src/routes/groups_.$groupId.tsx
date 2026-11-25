import { opaqueUuidPathParam } from "@/domain/opaque-url-id";
import { useEffect, useState, type KeyboardEvent } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import {
  MutationFeedback, PageFrame, PageEyebrow, PageTitle, RecordHeader,
  RecordLayout, StatusBadge, WorkspaceNotice, secondaryActionClassName,
} from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { groupSessionSelectionSchema } from "@/lib/route-search";
import { Users } from "lucide-react";
import { getCanonicalGroupWorkspace, getStudyGroupAvailability } from "@/modules/study-groups/canonical-workspace.functions";
import { groupKindLabel, nextGroupSession } from "@/domain/study-group-display";
import { GroupOverviewPanel, GroupDetailsPanel, GroupResourcesPanel } from "@/components/groups/GroupInformationPanels";
import { GroupSessionsPanel } from "@/components/groups/GroupSessionsPanel";
import { GroupStudentMembershipPanel } from "@/components/groups/GroupStudentMembershipPanel";
import { GroupDiscussionPanel } from "@/components/groups/GroupDiscussionPanel";
import { GroupMembersPanel } from "@/components/groups/GroupMembersPanel";
import { GroupReportsPanel } from "@/components/groups/GroupReportsPanel";

const sessionSearchSchema = groupSessionSelectionSchema.pick({ session: true });
const loadGroupDetail = async () => {
  const availability = await getStudyGroupAvailability();
  if (!availability.enabled) return { availability, workspace: null };
  return { availability, workspace: await getCanonicalGroupWorkspace() };
};

export const Route = createFileRoute("/groups_/$groupId")({
  params: opaqueUuidPathParam("groupId"),
  validateSearch: (search: Record<string, unknown>): { session?: string } => sessionSearchSchema.parse(search),
  loader: safeLoader(loadGroupDetail, {
    authMessage: "Sign in as a student or teacher to access your study groups.",
  }),
  component: GroupDetailPage,
});

type Data = Awaited<ReturnType<typeof loadGroupDetail>>;

function GroupDetailPage() {
  const outcome = Route.useLoaderData();
  const { groupId } = Route.useParams();
  if (!outcome.ok) return <LoaderFailure eyebrow="Study groups" title="Study group" outcome={outcome} />;
  return <GroupDetailView key={groupId} data={outcome.data} groupId={groupId} />;
}

function GroupDetailView({ data, groupId }: { data: Data; groupId: string }) {
  const router = useRouter();
  const { session: selectedSession } = Route.useSearch();
  const mutation = useMutationFeedback(() => router.invalidate());
  const [activeTab, setActiveTab] = useState<"overview" | "discussion" | "resources" | "sessions">(selectedSession ? "sessions" : "overview");
  // Calendar deep links must expose the session rather than a hidden panel.
  useEffect(() => { if (selectedSession) setActiveTab("sessions"); }, [selectedSession]);
  const busy = mutation.pending || mutation.refreshFailed;
  const { availability, workspace } = data;
  const group = workspace?.groups.find(candidate => candidate.id === groupId);
  const backLink = <Link to="/groups" className="underline">Study groups</Link>;
  if (!workspace || !group) return <PageFrame width="wide">
    <RecordLayout header={<RecordHeader eyebrow="Collaboration" title="Study group" breadcrumbs={backLink} />}
      main={<WorkspaceNotice tone="danger">
        {!workspace ? "Study groups are currently unavailable."
          : "This group is unavailable in your current workspace."}
      </WorkspaceNotice>} />
  </PageFrame>;
  const role = workspace.role;
  const approvedMember = role === "teacher" || group.membershipStatus === "approved";
  const next = nextGroupSession(group);
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "discussion", label: "Discussion", count: group.posts.length },
    { id: "resources", label: "Resources" },
    { id: "sessions", label: "Sessions", count: group.sessions.length },
  ] as const;
  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === undefined) return;
    const nextTab = tabs[nextIndex];
    if (!nextTab) return;
    event.preventDefault();
    setActiveTab(nextTab.id);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role='tab']")[nextIndex]?.focus();
  }
  async function run(work: () => Promise<unknown>, message: string) {
    await mutation.run(work, {
      successMessage: message,
      commandErrorMessage: "Unable to save group change.",
    });
  }
  return <PageFrame width="wide">
    <RecordLayout
      header={<section className="grid gap-5 border border-border bg-card p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="mb-4 text-xs text-muted-foreground">{backLink}</nav>
          <PageEyebrow>{role === "student" ? "Student study group" : "Facilitated study group"}</PageEyebrow>
          <PageTitle data-variant="record" className="mt-2">{group.title}</PageTitle>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
            <span>{groupKindLabel(group.kind)} · Facilitated by {group.facilitatorName}</span>
            {role === "student" && <StatusBadge
              tone={group.membershipStatus === "approved" ? "success"
                : group.membershipStatus === "pending" ? "attention" : "neutral"}>
              {group.membershipStatus ?? "Not joined"}
            </StatusBadge>}
          </div>
          {group.description && <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{group.description}</p>}
          <div className="mt-4">
            <Link to="/groups" className={secondaryActionClassName}>All study groups</Link>
          </div>
        </div>
        <div className="flex items-center gap-4 border-t border-border pt-4 lg:flex-col lg:items-start lg:justify-center lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <div className="grid size-12 shrink-0 place-items-center border bg-muted text-muted-foreground">
            <Users aria-hidden="true" className="size-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Group members</p>
            <p className="mt-1 text-sm font-semibold">
              {group.memberCount} approved {group.memberCount === 1 ? "member" : "members"}
            </p>
            <p className="text-xs text-muted-foreground">Up to {group.maxMembers} participants</p>
          </div>
        </div>
      </section>}
      main={<>
        <div className="grid grid-cols-3 border border-border bg-card">
          <div className="border-r border-border p-3 sm:p-5">
            <p className="text-xl font-semibold tabular-nums sm:text-2xl">{group.memberCount}</p>
            <p className="text-xs text-muted-foreground">Group members</p>
          </div>
          <div className="border-r border-border p-3 sm:p-5">
            <p className="text-xl font-semibold tabular-nums sm:text-2xl">{group.sessions.length}</p>
            <p className="text-xs text-muted-foreground">Group sessions</p>
          </div>
          <div className="p-3 sm:p-5">
            <p className="text-xl font-semibold tabular-nums sm:text-2xl">{group.posts.length}</p>
            <p className="text-xs text-muted-foreground">Discussion posts</p>
          </div>
        </div>
        <MutationFeedback state={mutation} pendingMessage="Saving group change..." />
        <div className="border border-border bg-card" role="tablist" aria-label="Study group sections">
          <div className="flex min-w-0 overflow-x-auto">
            {tabs.map((tab, index) => <Button variant="ghost" key={tab.id} id={`group-tab-${tab.id}`} type="button" role="tab"
              aria-selected={activeTab === tab.id} aria-controls={`group-panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => setActiveTab(tab.id)}
              onKeyDown={event => handleTabKeyDown(event, index)}
              className={activeTab === tab.id
                ? "inline-flex min-h-12 shrink-0 items-center gap-2 border-b-2 border-primary px-4 text-sm font-semibold text-primary"
                : "inline-flex min-h-12 shrink-0 items-center gap-2 border-b-2 border-transparent px-4 text-sm font-medium text-muted-foreground hover:text-foreground"}>
              {tab.label}
              {"count" in tab && <span className="bg-muted px-2 py-0.5 text-xs tabular-nums">{tab.count}</span>}
            </Button>)}
          </div>
        </div>
        <section id="group-panel-overview" role="tabpanel" aria-labelledby="group-tab-overview" tabIndex={0}
          hidden={activeTab !== "overview"} className="space-y-5">
          <GroupOverviewPanel group={group} next={next} />
        </section>
        <section id="group-panel-discussion" role="tabpanel" aria-labelledby="group-tab-discussion" tabIndex={0}
          hidden={activeTab !== "discussion"}>
          <GroupDiscussionPanel group={group} role={role} availability={availability}
            approvedMember={approvedMember} busy={busy} run={run} mutation={mutation} />
        </section>
        <section id="group-panel-resources" role="tabpanel" aria-labelledby="group-tab-resources" tabIndex={0}
          hidden={activeTab !== "resources"}>
          <GroupResourcesPanel group={group} approvedMember={approvedMember} role={role} />
        </section>
        <section id="group-panel-sessions" role="tabpanel" aria-labelledby="group-tab-sessions" tabIndex={0}
          hidden={activeTab !== "sessions"}>
          <GroupSessionsPanel group={group} role={role} availability={availability} busy={busy} run={run}
            mutation={mutation} selectedSession={selectedSession} />
        </section>
      </>}
      rail={<>
        <GroupDetailsPanel group={group} />
        {role === "student" && <GroupStudentMembershipPanel group={group} availability={availability}
          hasEnrollmentGuardian={workspace.hasEnrollmentGuardian} busy={busy} run={run} />}
        {role === "teacher" && <GroupMembersPanel group={group} availability={availability} busy={busy} run={run} />}
        {role === "teacher" && <GroupReportsPanel group={group} availability={availability} busy={busy} run={run} />}
      </>} />
  </PageFrame>;
}

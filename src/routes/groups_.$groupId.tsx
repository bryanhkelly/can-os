import { useEffect, useState, type KeyboardEvent } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { mutationErrorMessage, useMutationFeedback } from "@/lib/mutation-feedback";
import { dateTimeInputValue, formatTimestamp } from "@/modules/calendar/timezone";
import { siteLocalTimeToIso } from "@/modules/calendar/site-local-time";
import {
  ActionDialog, EmptyState, LocalDateTimeField, MutationFeedback, PageFrame,
  PageEyebrow, PageTitle, RecordHeader, RecordLayout, StatusBadge, WorkspaceNotice,
  WorkspacePanel, secondaryActionClassName,
} from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { groupSessionSelectionSchema } from "@/lib/route-search";
import { Users } from "lucide-react";
import {
  getCanonicalGroupWorkspace, getStudyGroupAvailability,
} from "@/modules/study-groups/canonical-workspace.functions";
import {
  decideCanonicalGroupMembership, inviteCanonicalGroupMembers,
  leaveCanonicalGroup, listCanonicalGroupInvitees, requestCanonicalGroupMembership,
} from "@/modules/study-groups/canonical-membership.functions";
import {
  createCanonicalGroupPost, reportCanonicalGroupPost, resolveCanonicalGroupReport,
} from "@/modules/study-groups/canonical-moderation.functions";
import {
  createCanonicalGroupSession, recordCanonicalGroupAttendance,
  reviseCanonicalGroupSession, rsvpCanonicalGroupSession,
} from "@/modules/study-groups/canonical-sessions.functions";
import { groupKindLabel, nextGroupSession } from "@/routes/groups";

const sessionSearchSchema = groupSessionSelectionSchema.pick({ session: true });
const loadGroupDetail = async () => {
  const availability = await getStudyGroupAvailability();
  if (!availability.enabled) return { availability, workspace: null };
  return { availability, workspace: await getCanonicalGroupWorkspace() };
};

export const Route = createFileRoute("/groups_/$groupId")({
  validateSearch: (search: Record<string, unknown>): { session?: string } => sessionSearchSchema.parse(search),
  loader: safeLoader(loadGroupDetail, {
    authMessage: "Sign in as a student or teacher to access your study groups.",
  }),
  component: GroupDetailPage,
});

type Data = Awaited<ReturnType<typeof loadGroupDetail>>;
type Workspace = NonNullable<Data["workspace"]>;
type Group = Workspace["groups"][number];
type Availability = Data["availability"];
type Run = (work: () => Promise<unknown>, message: string) => Promise<void>;

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
  const [activeTab, setActiveTab] = useState<"overview" | "discussion" | "resources" | "sessions">("overview");
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
            {tabs.map((tab, index) => <button key={tab.id} id={`group-tab-${tab.id}`} type="button" role="tab"
              aria-selected={activeTab === tab.id} aria-controls={`group-panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => setActiveTab(tab.id)}
              onKeyDown={event => handleTabKeyDown(event, index)}
              className={activeTab === tab.id
                ? "inline-flex min-h-12 shrink-0 items-center gap-2 border-b-2 border-primary px-4 text-sm font-semibold text-primary"
                : "inline-flex min-h-12 shrink-0 items-center gap-2 border-b-2 border-transparent px-4 text-sm font-medium text-muted-foreground hover:text-foreground"}>
              {tab.label}
              {"count" in tab && <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">{tab.count}</span>}
            </button>)}
          </div>
        </div>
        <section id="group-panel-overview" role="tabpanel" aria-labelledby="group-tab-overview" tabIndex={0}
          hidden={activeTab !== "overview"} className="space-y-5">
          <GroupOverviewPanel group={group} next={next} />
        </section>
        <section id="group-panel-discussion" role="tabpanel" aria-labelledby="group-tab-discussion" tabIndex={0}
          hidden={activeTab !== "discussion"}>
          <DiscussionPanel group={group} role={role} availability={availability}
            approvedMember={approvedMember} busy={busy} run={run} mutation={mutation} />
        </section>
        <section id="group-panel-resources" role="tabpanel" aria-labelledby="group-tab-resources" tabIndex={0}
          hidden={activeTab !== "resources"}>
          <ResourcesPanel />
        </section>
        <section id="group-panel-sessions" role="tabpanel" aria-labelledby="group-tab-sessions" tabIndex={0}
          hidden={activeTab !== "sessions"}>
          <SessionsPanel group={group} role={role} availability={availability} busy={busy} run={run}
            mutation={mutation} selectedSession={selectedSession} />
        </section>
      </>}
      rail={<>
        <GroupDetailsPanel group={group} />
        {role === "student" && <StudentMembershipPanel group={group} availability={availability}
          hasEnrollmentGuardian={workspace.hasEnrollmentGuardian} busy={busy} run={run} />}
        {role === "teacher" && <MembersPanel group={group} availability={availability} busy={busy} run={run} />}
        {role === "teacher" && <ReportsPanel group={group} availability={availability} busy={busy} run={run} />}
      </>} />
  </PageFrame>;
}

function GroupOverviewPanel({ group, next }: { group: Group; next: Group["sessions"][number] | null }) {
  const dateParts = next ? new Intl.DateTimeFormat("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: group.timezone,
  }).formatToParts(new Date(next.startsAt)) : [];
  const weekday = dateParts.find(part => part.type === "weekday")?.value;
  const month = dateParts.find(part => part.type === "month")?.value;
  const day = dateParts.find(part => part.type === "day")?.value;
  return <div className="space-y-5">
    <WorkspacePanel className="rounded-sm shadow-none" title="Our focus this week"
      description="Start with the facilitator's session agenda and group description.">
      <div className="border-l-2 border-primary pl-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Session focus</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
          {next?.agenda || group.description || "The facilitator has not shared a focus or agenda yet."}
        </p>
      </div>
    </WorkspacePanel>
    <WorkspacePanel className="rounded-sm shadow-none" title="Upcoming study sessions"
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

function GroupDetailsPanel({ group }: { group: Group }) {
  return <WorkspacePanel className="rounded-sm shadow-none" title="Study group details">
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

function ResourcesPanel() {
  return <WorkspacePanel className="rounded-sm shadow-none" title="Shared learning resources"
    description="Resources shared by a facilitator will appear here.">
    <EmptyState title="Group resources are not available here yet."
      description="No resources are exposed in this study-group workspace." />
  </WorkspacePanel>;
}

function StudentMembershipPanel({ group, availability, hasEnrollmentGuardian, busy, run }: {
  group: Group; availability: Availability;
  hasEnrollmentGuardian: boolean | null; busy: boolean; run: Run;
}) {
  const status = group.membershipStatus;
  return <WorkspacePanel title="Your membership"
    description="Participation requires guardian permission and facilitator approval.">
    <div className="space-y-3">
      {hasEnrollmentGuardian === false && <WorkspaceNotice tone="danger">
        A linked guardian is required to request study group membership. Ask your school to verify your guardian relationship.
      </WorkspaceNotice>}
      {status === "pending" && <WorkspaceNotice>
        Participation requires current guardian permission and facilitator approval. Check with your guardian and facilitator about this pending request.
      </WorkspaceNotice>}
      {status !== "approved" && status !== "pending" && <WorkspaceNotice>
        Request membership to access group discussions and sessions.
      </WorkspaceNotice>}
      <div className="flex flex-wrap gap-2">
        {!status || status === "left" || status === "declined"
          ? <button disabled={busy || !availability.membershipEnabled || hasEnrollmentGuardian !== true}
              className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
              onClick={() => void run(() => requestCanonicalGroupMembership({ data: { groupId: group.id } }),
                "Membership requested. A guardian and the facilitator must approve.")}>Request to join</button>
          : <button disabled={busy || !availability.membershipEnabled}
              className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
              onClick={() => void run(() => leaveCanonicalGroup({ data: { groupId: group.id } }),
                status === "pending" ? "Membership request withdrawn." : "You left the study group.")}>
              {status === "pending" ? "Withdraw request" : "Leave group"}</button>}
      </div>
    </div>
  </WorkspacePanel>;
}

function SessionsPanel({ group, role, availability, busy, run, mutation, selectedSession }: {
  group: Group; role: Workspace["role"]; availability: Availability; busy: boolean; run: Run;
  mutation: ReturnType<typeof useMutationFeedback>; selectedSession?: string;
}) {
  const [scheduling, setScheduling] = useState(false);
  const [sessionTitle, setSessionTitle] = useState("");
  const [agenda, setAgenda] = useState("");
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [reschedule, setReschedule] = useState<{ id: string; title: string; start: string; end: string } | null>(null);
  const now = new Date();
  const unknownSession = Boolean(selectedSession) &&
    !group.sessions.some(session => session.id === selectedSession);
  return <WorkspacePanel title="Sessions"
    description={`Times shown in ${group.timezone}.`}
    actions={role === "teacher" && <button type="button" disabled={busy || !availability.writesEnabled}
      className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50"
      onClick={() => setScheduling(open => !open)}>
      {scheduling ? "Close scheduler" : "Schedule session"}</button>}>
    <div className="space-y-3">
      {unknownSession && <WorkspaceNotice tone="danger">This session is unavailable in this study group.</WorkspaceNotice>}
      {role === "teacher" && scheduling && <form noValidate
        className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2"
        onSubmit={event => {
          event.preventDefault();
          setAttempted(true);
          if (sessionTitle.trim().length < 3 || !starts || !ends || ends <= starts) return;
          void run(async () => {
            await createCanonicalGroupSession({ data: {
              groupId: group.id, title: sessionTitle, agenda,
              startsAt: siteLocalTimeToIso(starts, group.timezone),
              endsAt: siteLocalTimeToIso(ends, group.timezone),
            } });
            setSessionTitle(""); setAgenda(""); setStarts(""); setEnds("");
            setScheduling(false); setAttempted(false);
          }, "Session scheduled.");
        }}>
        <Field label="Session title" className="text-sm" required
          error={attempted && sessionTitle.trim().length < 3 ? "Enter a session title with at least 3 characters." : undefined}>
          <Input minLength={3} maxLength={150} value={sessionTitle}
            onChange={event => setSessionTitle(event.target.value)} />
        </Field>
        <Field label="Agenda" className="text-sm">
          <Input value={agenda} onChange={event => setAgenda(event.target.value)} />
        </Field>
        <LocalDateTimeField label="Start" timezone={group.timezone} value={starts} onChange={setStarts} required disabled={busy} />
        <LocalDateTimeField label="End" timezone={group.timezone} value={ends} onChange={setEnds} required disabled={busy} />
        {attempted && (!starts || !ends || ends <= starts) &&
          <FieldError className="sm:col-span-2">Choose an end time later than the start.</FieldError>}
        <div><Button type="submit" disabled={busy}>Schedule session</Button></div>
      </form>}
      {group.sessions.map(session => {
        const upcoming = !session.cancelled && new Date(session.startsAt) > now;
        const past = !session.cancelled && new Date(session.startsAt) <= now;
        return <div key={session.id} aria-current={selectedSession === session.id ? "true" : undefined}
          className={selectedSession === session.id ? "rounded-lg border-2 border-primary p-3" : "rounded-lg border p-3"}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">{session.title}</p>
            {session.cancelled && <StatusBadge tone="danger">Cancelled</StatusBadge>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatTimestamp(session.startsAt, group.timezone)} – {formatTimestamp(session.endsAt, group.timezone)}
            {" · "}{session.location || "Location to be confirmed"}
          </p>
          {session.agenda && <p className="mt-2 text-sm">{session.agenda}</p>}
          {role === "student" && upcoming && <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs">Your RSVP: {session.rsvp ?? "not selected"}</span>
            {(["going", "maybe", "declined"] as const).map(value =>
              <button key={value} disabled={busy || !availability.writesEnabled}
                className="rounded border px-3 py-1 text-xs disabled:opacity-50"
                onClick={() => void run(() => rsvpCanonicalGroupSession({
                  data: { sessionId: session.id, rsvp: value },
                }), "RSVP updated.")}>{value}</button>)}
          </div>}
          {role === "teacher" && upcoming && <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={busy || !availability.writesEnabled}
              className="rounded border px-3 py-1 text-xs disabled:opacity-50"
              onClick={() => setReschedule({
                id: session.id, title: session.title,
                start: dateTimeInputValue(session.startsAt, group.timezone),
                end: dateTimeInputValue(session.endsAt, group.timezone),
              })}>Reschedule</button>
            <button type="button" disabled={busy || !availability.writesEnabled}
              className="rounded border border-destructive px-3 py-1 text-xs disabled:opacity-50"
              onClick={() => void run(() => reviseCanonicalGroupSession({ data: {
                sessionId: session.id, action: "cancel",
              } }), "Session cancelled.")}>Cancel session</button>
          </div>}
          {role === "teacher" && past && <div className="mt-3 space-y-2">
            <p className="text-xs font-semibold">Attendance</p>
            {group.roster.map(student => {
              const attendance = session.attendance.find(row => row.personId === student.personId);
              return <div key={student.personId} className="flex flex-wrap items-center gap-2">
                <span className="flex-1 text-xs">{student.studentName}
                  {" · "}{attendance?.attended === true ? "Present"
                    : attendance?.attended === false ? "Absent" : "Not recorded"}</span>
                {([true, false] as const).map(attended =>
                  <button type="button" key={String(attended)} disabled={busy || !availability.writesEnabled}
                    className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                    onClick={() => void run(() => recordCanonicalGroupAttendance({ data: {
                      sessionId: session.id, studentPersonId: student.personId, attended,
                    } }), "Attendance saved.")}>{attended ? "Present" : "Absent"}</button>)}
              </div>;
            })}
            {group.roster.length === 0 &&
              <p className="text-xs text-muted-foreground">No approved students to mark.</p>}
          </div>}
        </div>;
      })}
      {group.sessions.length === 0 && <EmptyState title="No sessions scheduled."
        description={role === "teacher" ? "Schedule the first session for this group."
          : "The facilitator has not scheduled a session yet."} />}
    </div>
    {reschedule && <ActionDialog open title={`Reschedule ${reschedule.title}`} confirmLabel="Save session time"
      description={`Enter times in ${group.timezone}. Nonexistent or ambiguous daylight-saving times are not accepted.`}
      pending={mutation.pending} confirmDisabled={busy || !availability.writesEnabled}
      onClose={() => setReschedule(null)}
      onConfirm={() => void mutation.run(() => reviseCanonicalGroupSession({ data: {
        sessionId: reschedule.id, action: "reschedule",
        startsAt: siteLocalTimeToIso(reschedule.start, group.timezone),
        endsAt: siteLocalTimeToIso(reschedule.end, group.timezone),
      } }), {
        successMessage: "Session rescheduled.",
        commandErrorMessage: "Unable to save group change.",
      }).then(outcome => {
        if (outcome.status === "saved" || outcome.status === "refresh-failed") setReschedule(null);
      })}>
      <LocalDateTimeField label="New start" timezone={group.timezone} value={reschedule.start}
        onChange={start => setReschedule(current => current && { ...current, start })} required />
      <LocalDateTimeField label="New end" timezone={group.timezone} value={reschedule.end}
        onChange={end => setReschedule(current => current && { ...current, end })} required />
      <MutationFeedback state={mutation} pendingMessage="Saving group change..." />
    </ActionDialog>}
  </WorkspacePanel>;
}

function DiscussionPanel({ group, role, availability, approvedMember, busy, run, mutation }: {
  group: Group; role: Workspace["role"]; availability: Availability;
  approvedMember: boolean; busy: boolean; run: Run;
  mutation: ReturnType<typeof useMutationFeedback>;
}) {
  const [draft, setDraft] = useState("");
  const [postAttempted, setPostAttempted] = useState(false);
  const [report, setReport] = useState<{ postId: string; body: string } | null>(null);
  const [reportReason, setReportReason] = useState("");
  if (!approvedMember) return <WorkspacePanel title="Group discussion">
    <WorkspaceNotice>Discussions are visible to approved group members.</WorkspaceNotice>
  </WorkspacePanel>;
  return <WorkspacePanel title="Group discussion"
    description="Posts are visible to approved group members. Report unsafe or inappropriate content for facilitator review. For urgent safety concerns, contact a trusted adult or school staff directly.">
    <div className="space-y-3">
      {group.posts.map(post => <div key={post.id} className="rounded-lg border p-3">
        <p className="text-sm whitespace-pre-wrap">{post.body}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {formatTimestamp(post.createdAt, group.timezone)}
        </p>
        {role === "student" && <button type="button"
          disabled={busy || !availability.contentEnabled} className="mt-2 text-xs underline disabled:opacity-50"
          onClick={() => { setReport({ postId: post.id, body: post.body }); setReportReason(""); }}>
          Report</button>}
      </div>)}
      {group.posts.length === 0 && <p className="text-sm text-muted-foreground">No posts yet.</p>}
      <form noValidate className="flex flex-col gap-2" onSubmit={event => {
        event.preventDefault();
        setPostAttempted(true);
        if (!draft.trim()) return;
        void run(async () => {
          await createCanonicalGroupPost({ data: { groupId: group.id, body: draft } });
          setDraft(""); setPostAttempted(false);
        }, "Post shared with your group.");
      }}>
        <Field label="New post" className="text-xs" required
          error={postAttempted && !draft.trim() ? "Enter a post before sending." : undefined}>
          <Textarea value={draft} maxLength={3000} disabled={busy || !availability.contentEnabled}
            onChange={event => setDraft(event.target.value)}
            placeholder="Share a question or a study tip" />
        </Field>
        <Button type="submit" disabled={busy || !availability.contentEnabled} className="w-fit">Post message</Button>
      </form>
    </div>
    {report && <ActionDialog open title="Report study group post"
      description="Explain why this post needs facilitator review. For urgent safety concerns, contact a trusted adult or school staff directly."
      confirmLabel="Send report" pending={mutation.pending}
      confirmDisabled={busy || !availability.contentEnabled || reportReason.trim().length < 5}
      onClose={() => setReport(null)}
      onConfirm={() => void mutation.run(() => reportCanonicalGroupPost({ data: {
        groupId: group.id, postId: report.postId, reason: reportReason,
      } }), {
        successMessage: "Your report was sent for facilitator review.",
        commandErrorMessage: "Unable to report this post.",
      }).then(outcome => {
        if (outcome.status === "saved" || outcome.status === "refresh-failed") setReport(null);
      })}>
      <blockquote className="rounded border bg-muted p-3 text-sm whitespace-pre-wrap">{report.body}</blockquote>
      <Field label="Reason for reporting" className="text-sm" required>
        <Textarea required minLength={5} maxLength={1000} value={reportReason}
          onChange={event => setReportReason(event.target.value)} />
      </Field>
      <MutationFeedback state={mutation} pendingMessage="Sending report..." />
    </ActionDialog>}
  </WorkspacePanel>;
}

function MembersPanel({ group, availability, busy, run }: {
  group: Group; availability: Availability; busy: boolean; run: Run;
}) {
  const [inviting, setInviting] = useState(false);
  const [selectedInviteeIds, setSelectedInviteeIds] = useState<string[]>([]);
  const [inviteAttempted, setInviteAttempted] = useState(false);
  const [inviteeLoad, setInviteeLoad] = useState<{
    loaded: boolean;
    invitees: Awaited<ReturnType<typeof listCanonicalGroupInvitees>>;
    error: string;
  }>({ loaded: false, invitees: [], error: "" });
  useEffect(() => {
    let active = true;
    if (!inviting) return () => { active = false; };
    setInviteeLoad({ loaded: false, invitees: [], error: "" });
    listCanonicalGroupInvitees({ data: { groupId: group.id } })
      .then(invitees => { if (active) setInviteeLoad({ loaded: true, invitees, error: "" }); })
      .catch(error => {
        if (active) setInviteeLoad({
          loaded: true, invitees: [],
          error: mutationErrorMessage(error, "Unable to load eligible students."),
        });
      });
    return () => { active = false; };
  }, [inviting, group.id]);
  return <WorkspacePanel title="Members and invitations"
    description="Invited students still need guardian permission and facilitator approval to join."
    actions={<button type="button" disabled={busy || !availability.membershipEnabled}
      className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50"
      onClick={() => { setSelectedInviteeIds([]); setInviteAttempted(false); setInviting(open => !open); }}>
      {inviting ? "Close invitations" : "Invite students"}</button>}>
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Pending requests</h3>
        {group.pendingMembers.map(member => <div key={member.id}
          className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">{member.studentName}</p>
            <p className="text-xs text-muted-foreground">
              {member.guardianReady ? "Guardian permission recorded" : "Awaiting guardian permission"}
            </p>
          </div>
          <div className="flex gap-2">
            <button disabled={busy || !availability.membershipEnabled}
              className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50"
              onClick={() => void run(() => decideCanonicalGroupMembership({ data: {
                groupId: group.id, studentPersonId: member.studentPersonId, approve: false,
              } }), "Membership declined.")}>Decline</button>
            <button disabled={busy || !availability.membershipEnabled || !member.guardianReady}
              className="rounded-lg bg-foreground px-3 py-2 text-xs text-background disabled:opacity-50"
              onClick={() => void run(() => decideCanonicalGroupMembership({ data: {
                groupId: group.id, studentPersonId: member.studentPersonId, approve: true,
              } }), "Membership approved.")}>Approve</button>
          </div>
        </div>)}
        {group.pendingMembers.length === 0 &&
          <p className="mt-2 text-xs text-muted-foreground">No pending memberships.</p>}
      </div>
      {inviting && <form noValidate className="space-y-3 rounded-lg border p-4" onSubmit={event => {
        event.preventDefault();
        setInviteAttempted(true);
        if (!selectedInviteeIds.length) return;
        void run(async () => {
          await inviteCanonicalGroupMembers({ data: {
            groupId: group.id, studentPersonIds: selectedInviteeIds,
          } });
          setSelectedInviteeIds([]); setInviting(false); setInviteAttempted(false);
        }, "Invitations sent. Students still need guardian permission and facilitator approval to join.");
      }}>
        <p className="text-xs text-muted-foreground">
          Invitations notify students; they must request membership before joining.
        </p>
        {!inviteeLoad.loaded && <p role="status" className="text-xs text-muted-foreground">Loading eligible students...</p>}
        {inviteeLoad.error && <p role="alert" className="text-xs text-destructive">{inviteeLoad.error}</p>}
        {inviteeLoad.loaded && !inviteeLoad.error && inviteeLoad.invitees.length === 0 &&
          <p className="text-xs text-muted-foreground">No eligible students are available to invite.</p>}
        {inviteeLoad.invitees.map(student => <label key={student.personId} className="flex items-center gap-2 text-sm">
          <input type="checkbox" disabled={busy} checked={selectedInviteeIds.includes(student.personId)}
            onChange={event => setSelectedInviteeIds(ids => event.target.checked
              ? [...ids, student.personId]
              : ids.filter(id => id !== student.personId))} />
          {student.firstName} {student.lastName}
        </label>)}
        {inviteAttempted && !selectedInviteeIds.length &&
          <FieldError>Select at least one student to invite.</FieldError>}
        <Button type="submit" disabled={busy || !inviteeLoad.loaded}>
          {busy ? "Sending invitations..." : "Send invitations"}
        </Button>
      </form>}
      <div>
        <h3 className="text-sm font-semibold">Members</h3>
        <ul className="mt-2 space-y-1">
          {group.roster.map(student => <li key={student.personId} className="text-sm">{student.studentName}</li>)}
        </ul>
        {group.roster.length === 0 && <p className="mt-2 text-xs text-muted-foreground">No approved members yet.</p>}
      </div>
    </div>
  </WorkspacePanel>;
}

function ReportsPanel({ group, availability, busy, run }: {
  group: Group; availability: Availability; busy: boolean; run: Run;
}) {
  return <WorkspacePanel title="Content reports"
    description="Open reports for this group's discussion.">
    <div className="space-y-3">
      {group.reports.map(report => <div key={report.id} className="rounded-lg border p-3">
        <p className="text-sm">Reason: {report.reason}</p>
        <blockquote className="mt-2 rounded border bg-muted p-3 text-sm whitespace-pre-wrap">
          {report.postBody ?? "The reported post is unavailable."}
        </blockquote>
        {report.postHidden && <p className="mt-1 text-xs text-muted-foreground">Post already hidden</p>}
        <div className="mt-2 flex gap-2">
          <button type="button" disabled={busy || !availability.moderationEnabled}
            className="rounded border border-destructive px-3 py-2 text-xs disabled:opacity-50"
            onClick={() => void run(() => resolveCanonicalGroupReport({ data: {
              reportId: report.id, hidePost: true,
            } }), "Reported post hidden.")}>Hide post</button>
          <button type="button" disabled={busy || !availability.moderationEnabled}
            className="rounded border px-3 py-2 text-xs disabled:opacity-50"
            onClick={() => void run(() => resolveCanonicalGroupReport({ data: {
              reportId: report.id, hidePost: false,
            } }), "Report reviewed; content retained.")}>Retain post</button>
        </div>
      </div>)}
      {group.reports.length === 0 && <p className="text-xs text-muted-foreground">No open content reports.</p>}
    </div>
  </WorkspacePanel>;
}

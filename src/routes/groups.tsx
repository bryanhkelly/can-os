import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { WorkspaceShell } from "@/components/workspace";
import { getCanonicalGroupWorkspace } from "@/modules/study-groups/canonical-workspace.functions";
import {
  createCanonicalGroupPost, reportCanonicalGroupPost, resolveCanonicalGroupReport,
} from "@/modules/study-groups/canonical-moderation.functions";
import {
  createFacilitatedGroup, requestCanonicalGroupMembership,
  decideCanonicalGroupMembership, leaveCanonicalGroup,
} from "@/modules/study-groups/canonical-membership.functions";
import {
  createCanonicalGroupSession, reviseCanonicalGroupSession, rsvpCanonicalGroupSession,
  recordCanonicalGroupAttendance,
} from "@/modules/study-groups/canonical-sessions.functions";

export const Route = createFileRoute("/groups")({
  validateSearch:(search:Record<string,unknown>):{group?:string}=>({
    group:typeof search.group==="string"?search.group:undefined,
  }),
  loader: safeLoader(() => getCanonicalGroupWorkspace(), {
    authMessage: "Sign in as a student or teacher to access your study groups.",
  }),
  component: GroupsPage,
});
type Workspace = Awaited<ReturnType<typeof getCanonicalGroupWorkspace>>;
type Group = Workspace["groups"][number];

function GroupsPage() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) return <LoaderFailure eyebrow="CAN OS · Groups" title="Study groups" outcome={outcome} />;
  return <GroupsView data={outcome.data} />;
}
function toIso(local: string) {
  const date = new Date(local);
  if (!Number.isFinite(date.getTime())) throw new Error("Choose a valid date and time.");
  return date.toISOString();
}
function localTime(iso: string) {
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function GroupsView({ data }: { data: Workspace }) {
  const router = useRouter();
  const {group:requestedGroup}=Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [sectionId, setSectionId] = useState(data.sections[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [maxMembers, setMaxMembers] = useState(20);
  const [sessionGroup, setSessionGroup] = useState("");
  const [sessionTitle, setSessionTitle] = useState("");
  const [agenda, setAgenda] = useState("");
  const [sessionStarts, setSessionStarts] = useState("");
  const [sessionEnds, setSessionEnds] = useState("");
  const [reschedules, setReschedules] = useState<Record<string, { start: string; end: string }>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [reportingPost, setReportingPost] = useState("");
  const [reportReason, setReportReason] = useState("");

  async function run(work: () => Promise<unknown>, message: string) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await work();
      await router.invalidate();
      setNotice(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save group change.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <WorkspaceShell eyebrow="CAN OS · Collaboration" title="Study groups"
      subtitle={data.role === "teacher"
        ? "Create facilitated course groups, review membership and manage the canonical meeting schedule."
        : "Discover your school's groups, request participation and manage upcoming session RSVPs."}
      actions={<Link to={data.role === "teacher" ? "/teacher" : "/student"}
        className="rounded-lg border px-3 py-2 text-sm">Workspace home</Link>}
    >
      {notice && <p role="status" className="mt-4 rounded-lg border p-3 text-sm">{notice}</p>}
      {error && <p role="alert" className="mt-4 rounded-lg border border-red-500 p-3 text-sm">{error}</p>}
      {requestedGroup&&<Link to="/groups" className="mt-4 inline-block text-sm underline">View all study groups</Link>}
      {requestedGroup&&!data.groups.some(group=>group.id===requestedGroup)&&<p role="alert" className="mt-4 rounded-lg border p-4 text-sm">This group is unavailable in your current workspace.</p>}
      {data.role === "teacher" && <section className="mt-8 rounded-xl border bg-card p-5">
        <h2 className="text-lg font-semibold">Create a course group</h2>
        <p className="mt-1 text-sm text-muted-foreground">Only sections you actively teach can host a group.</p>
        <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={event => {
          event.preventDefault();
          void run(async () => {
            await createFacilitatedGroup({ data: { sectionId, title, description, maxMembers } });
            setTitle(""); setDescription("");
          }, "Study group created.");
        }}>
          <label className="text-sm">Section
            <select className="mt-1 block w-full rounded border bg-background p-2"
              value={sectionId} onChange={event => setSectionId(event.target.value)} required>
              {data.sections.map(section =>
                <option key={section.id} value={section.id}>{section.title}</option>)}
            </select>
          </label>
          <label className="text-sm">Group title
            <input className="mt-1 block w-full rounded border bg-background p-2"
              value={title} onChange={event => setTitle(event.target.value)} minLength={3} maxLength={100} required />
          </label>
          <label className="text-sm sm:col-span-2">Description
            <textarea className="mt-1 block w-full rounded border bg-background p-2"
              value={description} onChange={event => setDescription(event.target.value)}
              minLength={10} maxLength={2000} required />
          </label>
          <label className="text-sm">Capacity
            <input className="mt-1 block w-full rounded border bg-background p-2"
              type="number" min={2} max={50} value={maxMembers}
              onChange={event => setMaxMembers(Number(event.target.value))} required />
          </label>
          <div className="flex items-end">
            <button disabled={busy || !sectionId}
              className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">
              Create group
            </button>
          </div>
        </form>
        {data.sections.length === 0 && <p className="mt-3 text-sm text-muted-foreground">
          No active teaching assignments are available.
        </p>}
      </section>}
      <section className="mt-8 space-y-5" aria-label="Available study groups">
        {data.groups.filter(group=>!requestedGroup||group.id===requestedGroup).map(group => <article key={group.id} className="rounded-xl border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold"><Link to="/groups" search={{group:group.id}} className="hover:underline">{group.title}</Link></h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{group.description}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Capacity: {group.maxMembers}
                {data.role === "student" ? " · " + (group.membershipStatus ?? "Not joined") : ""}
              </p>
            </div>
            {data.role === "student" && (
              group.membershipStatus === "pending"
                ? <span className="rounded-full border px-3 py-1 text-xs">Awaiting review</span>
                : group.membershipStatus === "approved"
                ? <button disabled={busy} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
                    onClick={() => void run(
                      () => leaveCanonicalGroup({ data: { groupId: group.id } }),
                      "You left the study group.",
                    )}>Leave group</button>
                : <button disabled={busy} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
                    onClick={() => void run(
                      () => requestCanonicalGroupMembership({ data: { groupId: group.id } }),
                      "Membership requested. A guardian and the facilitator must approve.",
                    )}>Request to join</button>
            )}
          </div>
          {data.role === "teacher" && <TeacherGroupControls
            group={group} busy={busy} run={run}
            sessionGroup={sessionGroup} setSessionGroup={setSessionGroup}
            sessionTitle={sessionTitle} setSessionTitle={setSessionTitle}
            agenda={agenda} setAgenda={setAgenda}
            sessionStarts={sessionStarts} setSessionStarts={setSessionStarts}
            sessionEnds={sessionEnds} setSessionEnds={setSessionEnds}
            reschedules={reschedules} setReschedules={setReschedules}
          />}
          {(data.role === "teacher" || group.membershipStatus === "approved") && (
            <section className="mt-5 space-y-3 border-t pt-4" aria-label={group.title + " discussion"}>
              <h3 className="text-sm font-semibold">Group discussion</h3>
              {group.posts.map(post => <div key={post.id} className="rounded-lg border p-3">
                <p className="text-sm whitespace-pre-wrap">{post.body}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {new Date(post.createdAt).toLocaleString()}
                </p>
                {data.role === "student" && <button type="button"
                  className="mt-2 text-xs underline"
                  onClick={() => { setReportingPost(reportingPost === post.id ? "" : post.id); setReportReason(""); }}>
                  Report this post
                </button>}
                {data.role === "student" && reportingPost === post.id &&
                  <form className="mt-3 flex flex-wrap items-end gap-2"
                    onSubmit={event => { event.preventDefault();
                      void run(async () => {
                        await reportCanonicalGroupPost({ data: {
                          groupId: group.id, postId: post.id, reason: reportReason,
                        } });
                        setReportingPost(""); setReportReason("");
                      }, "Your report was sent for facilitator review.");
                    }}>
                    <label className="flex-1 text-xs">Why should this post be reviewed?
                      <input required minLength={5} maxLength={1000}
                        className="mt-1 block w-full rounded border bg-background p-2"
                        value={reportReason} onChange={event => setReportReason(event.target.value)} />
                    </label>
                    <button disabled={busy} className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50">
                      Send report
                    </button>
                  </form>}
              </div>)}
              {group.posts.length === 0 && <p className="text-xs text-muted-foreground">No posts yet.</p>}
              <form className="flex flex-col gap-2" onSubmit={event => {
                event.preventDefault();
                const body = drafts[group.id] ?? "";
                void run(async () => {
                  await createCanonicalGroupPost({ data: { groupId: group.id, body } });
                  setDrafts(previous => ({ ...previous, [group.id]: "" }));
                }, "Post shared with your group.");
              }}>
                <label className="text-xs">New post
                  <textarea value={drafts[group.id] ?? ""}
                    onChange={event => setDrafts(previous => ({ ...previous, [group.id]: event.target.value }))}
                    required maxLength={3000}
                    className="mt-1 block w-full rounded border bg-background p-3 text-sm"
                    placeholder="Share a question or a study tip" />
                </label>
                <button disabled={busy || !(drafts[group.id] ?? "").trim()}
                  className="w-fit rounded-lg bg-foreground px-4 py-2 text-xs font-semibold text-background disabled:opacity-50">
                  Post message
                </button>
              </form>
            </section>
          )}
          {group.sessions.length > 0 && <div className="mt-5 space-y-3 border-t pt-4">
            <h3 className="text-sm font-semibold">Sessions</h3>
            {group.sessions.map(session => <div key={session.id} className="rounded-lg border p-3">
              <p className="text-sm font-semibold">{session.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(session.startsAt).toLocaleString()} · {session.location || "Location to be confirmed"}
                {session.cancelled ? " · Cancelled" : ""}
              </p>
              {session.agenda && <p className="mt-2 text-sm">{session.agenda}</p>}
              {data.role === "student" && !session.cancelled &&
                new Date(session.startsAt) > new Date() &&
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs">Your RSVP: {session.rsvp ?? "not selected"}</span>
                  {(["going", "maybe", "declined"] as const).map(value =>
                    <button key={value} disabled={busy}
                      className="rounded border px-3 py-1 text-xs disabled:opacity-50"
                      onClick={() => void run(() => rsvpCanonicalGroupSession({
                        data: { sessionId: session.id, rsvp: value },
                      }), "RSVP updated.")}>{value}</button>)}
                </div>}
            </div>)}
          </div>}
        </article>)}
        {data.groups.length === 0 && <p className="rounded-xl border p-5 text-sm text-muted-foreground">
          {data.role === "teacher" ? "You have no facilitated study groups yet." :
            "There are no available groups for your active program enrollments."}
        </p>}
      </section>
    </WorkspaceShell>
  );
}

function TeacherGroupControls({ group, busy, run, sessionGroup, setSessionGroup,
  sessionTitle, setSessionTitle, agenda, setAgenda, sessionStarts, setSessionStarts,
  sessionEnds, setSessionEnds, reschedules, setReschedules,
}: {
  group: Group; busy: boolean; run: (work: () => Promise<unknown>, message: string) => Promise<void>;
  sessionGroup: string; setSessionGroup: (value: string) => void;
  sessionTitle: string; setSessionTitle: (value: string) => void;
  agenda: string; setAgenda: (value: string) => void;
  sessionStarts: string; setSessionStarts: (value: string) => void;
  sessionEnds: string; setSessionEnds: (value: string) => void;
  reschedules: Record<string, { start: string; end: string }>;
  setReschedules: (value: Record<string, { start: string; end: string }>) => void;
}) {
  return <div className="mt-5 space-y-4 border-t pt-4">
    <h3 className="text-sm font-semibold">Membership requests</h3>
    {group.pendingMembers.map(member => <div key={member.id}
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
      <div><p className="text-sm font-medium">{member.studentName}</p>
        <p className="text-xs text-muted-foreground">
          {member.guardianReady ? "Guardian permission recorded" : "Awaiting guardian permission"}
        </p></div>
      <div className="flex gap-2">
        <button disabled={busy} className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50"
          onClick={() => void run(() => decideCanonicalGroupMembership({ data: {
            groupId: group.id, studentPersonId: member.studentPersonId, approve: false,
          } }), "Membership declined.")}>Decline</button>
        <button disabled={busy || !member.guardianReady}
          className="rounded-lg bg-foreground px-3 py-2 text-xs text-background disabled:opacity-50"
          onClick={() => void run(() => decideCanonicalGroupMembership({ data: {
            groupId: group.id, studentPersonId: member.studentPersonId, approve: true,
          } }), "Membership approved.")}>Approve</button>
      </div>
    </div>)}
    {!group.pendingMembers.length && <p className="text-xs text-muted-foreground">No pending memberships.</p>}
    <h3 className="text-sm font-semibold">Content moderation</h3>
    {group.reports.map(report => <div key={report.id}
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
      <p className="text-sm">Report: {report.reason}</p>
      <div className="flex gap-2">
        <button type="button" disabled={busy} className="rounded border px-3 py-2 text-xs disabled:opacity-50"
          onClick={() => void run(() => resolveCanonicalGroupReport({ data: {
            reportId: report.id, hidePost: false,
          } }), "Report reviewed; content retained.")}>Retain post</button>
        <button type="button" disabled={busy}
          className="rounded border border-amber-500 px-3 py-2 text-xs disabled:opacity-50"
          onClick={() => void run(() => resolveCanonicalGroupReport({ data: {
            reportId: report.id, hidePost: true,
          } }), "Reported post hidden.")}>Hide post</button>
      </div>
    </div>)}
    {!group.reports.length && <p className="text-xs text-muted-foreground">No open content reports.</p>}
    <h3 className="text-sm font-semibold">Session attendance</h3>
    {group.sessions.filter(session => !session.cancelled && new Date(session.startsAt) <= new Date())
      .map(session => <div key={session.id} className="rounded-lg border p-3">
        <p className="text-sm font-semibold">{session.title}</p>
        {group.roster.map(student => {
          const attendance = session.attendance.find(row => row.personId === student.personId);
          return <div key={student.personId} className="mt-2 flex flex-wrap items-center gap-2">
            <span className="flex-1 text-xs">{student.studentName}
              {" · "}{attendance?.attended === true ? "Present" :
                attendance?.attended === false ? "Absent" : "Not recorded"}</span>
            {([true, false] as const).map(attended =>
              <button type="button" key={String(attended)} disabled={busy}
                className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                onClick={() => void run(() => recordCanonicalGroupAttendance({ data: {
                  sessionId: session.id, studentPersonId: student.personId, attended,
                } }), "Attendance saved.")}>{attended ? "Present" : "Absent"}</button>)}
          </div>;
        })}
        {group.roster.length === 0 &&
          <p className="mt-2 text-xs text-muted-foreground">No approved students to mark.</p>}
      </div>)}
    <button type="button" className="rounded-lg border px-3 py-2 text-xs"
      onClick={() => setSessionGroup(sessionGroup === group.id ? "" : group.id)}>
      {sessionGroup === group.id ? "Close scheduler" : "Schedule session"}
    </button>
    {sessionGroup === group.id && <form className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2"
      onSubmit={event => {
        event.preventDefault();
        void run(async () => {
          await createCanonicalGroupSession({ data: {
            groupId: group.id, title: sessionTitle, agenda, startsAt: toIso(sessionStarts),
            endsAt: toIso(sessionEnds),
          } });
          setSessionTitle(""); setAgenda(""); setSessionStarts(""); setSessionEnds("");
          setSessionGroup("");
        }, "Session scheduled.");
      }}>
      <label className="text-sm">Session title
        <input required minLength={3} maxLength={150} value={sessionTitle}
          onChange={event => setSessionTitle(event.target.value)}
          className="mt-1 block w-full rounded border bg-background p-2" />
      </label>
      <label className="text-sm">Agenda
        <input value={agenda} onChange={event => setAgenda(event.target.value)}
          className="mt-1 block w-full rounded border bg-background p-2" />
      </label>
      <label className="text-sm">Start
        <input required type="datetime-local" value={sessionStarts}
          onChange={event => setSessionStarts(event.target.value)}
          className="mt-1 block w-full rounded border bg-background p-2" />
      </label>
      <label className="text-sm">End
        <input required type="datetime-local" value={sessionEnds}
          onChange={event => setSessionEnds(event.target.value)}
          className="mt-1 block w-full rounded border bg-background p-2" />
      </label>
      <button disabled={busy}
        className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">
        Schedule session
      </button>
    </form>}
    {group.sessions.filter(session => !session.cancelled && new Date(session.startsAt) > new Date())
      .map(session => {
        const edited = reschedules[session.id] ?? {
          start: localTime(session.startsAt), end: localTime(session.endsAt),
        };
        return <div key={session.id} className="rounded-lg border p-3">
          <p className="mb-2 text-sm font-semibold">Change {session.title}</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs">Start
              <input type="datetime-local" value={edited.start}
                onChange={event => setReschedules({
                  ...reschedules, [session.id]: { ...edited, start: event.target.value },
                })} className="mt-1 block rounded border bg-background p-2" />
            </label>
            <label className="text-xs">End
              <input type="datetime-local" value={edited.end}
                onChange={event => setReschedules({
                  ...reschedules, [session.id]: { ...edited, end: event.target.value },
                })} className="mt-1 block rounded border bg-background p-2" />
            </label>
            <button type="button" disabled={busy}
              className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50"
              onClick={() => void run(() => reviseCanonicalGroupSession({ data: {
                sessionId: session.id, action: "reschedule",
                startsAt: toIso(edited.start), endsAt: toIso(edited.end),
              } }), "Session rescheduled.")}>Save time</button>
            <button type="button" disabled={busy}
              className="rounded-lg border border-amber-500 px-3 py-2 text-xs disabled:opacity-50"
              onClick={() => void run(() => reviseCanonicalGroupSession({ data: {
                sessionId: session.id, action: "cancel",
              } }), "Session cancelled.")}>Cancel session</button>
          </div>
        </div>;
      })}
  </div>;
}

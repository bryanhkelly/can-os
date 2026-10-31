import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { getTeacherMissingWork, createMissingWorkFollowUp } from "@/modules/learning/teacher-missing-work.functions";
import { WorkspaceShell, StatCard, EmptyState } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

const loadMissingWork = () => getTeacherMissingWork();

export const Route = createFileRoute("/teacher/missing-work")({
  loader: safeLoader(loadMissingWork, { authMessage: "Sign in with an authorized teacher account to view missing work." }),
  component: TeacherMissingWork,
});

function TeacherMissingWork() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) return <LoaderFailure eyebrow="CAN OS · Teacher" title="Missing work" outcome={outcome} />;
  return <TeacherMissingWorkView data={outcome.data} />;
}

function TeacherMissingWorkView({ data }: { data: Awaited<ReturnType<typeof loadMissingWork>> }) {
  const { connected, items } = data;
  const router = useRouter();
  const [busyItem, setBusyItem] = useState("");
  const [followedUp, setFollowedUp] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState("");
  const studentCount = new Set(items.map(x => x.studentProfileId)).size;

  return (
    <WorkspaceShell
      eyebrow="CAN OS · Teacher"
      title="Missing work"
      subtitle="Overdue missing submissions and returned revisions for actively enrolled students in your classes."
      actions={<p className="mt-2 text-xs"><Link to="/notifications" className="underline">Teacher notifications →</Link></p>}
    >
      {notice && <p role="status" className="mt-4 rounded-xl border p-3">{notice}</p>}
      {!connected && <p role="status" className="mt-4 rounded-xl border p-4">Neon is not connected. The queue cannot load.</p>}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <StatCard value={items.length} label="Overdue student-assignment items" />
        <StatCard value={studentCount} label="Students needing follow-up" />
      </div>
      <section className="mt-6 space-y-3">
        {items.map(x => (
          <article key={x.assessmentId + ":" + x.studentProfileId} className="rounded-xl border bg-card p-5">
            <p className="text-xs text-muted-foreground">{x.course} · due {new Date(x.dueAt).toLocaleDateString()}</p>
            <h2 className="mt-2 font-semibold">{x.title}</h2>
            <p className="mt-2 text-xs"><Link to="/teacher/gradebook" search={{section:x.sectionId}} className="underline">Open class gradebook</Link></p>
            <p className="mt-1 text-sm">{x.studentName} · {x.status === "returned" ? "Returned for revision; awaiting resubmission" : x.status === "assigned" ? "Assigned but not submitted" : "No attempt recorded"}</p>
            <span className="mt-3 inline-block text-xs text-muted-foreground">Assessment ID: {x.assessmentId.slice(0,8)}</span>
            <button
              disabled={Boolean(busyItem) || Boolean(followedUp[x.assessmentId + ":" + x.studentProfileId])}
              className="ml-4 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50"
              onClick={async () => {
                setBusyItem(x.assessmentId + ":" + x.studentProfileId);
                try {
                  const result = await createMissingWorkFollowUp({ data: { assessmentId: x.assessmentId, studentProfileId: x.studentProfileId } });
                  setFollowedUp(previous => ({...previous, [x.assessmentId + ":" + x.studentProfileId]: true}));
                  setNotice(result.created ? "Follow-up added to Operations." : "An open follow-up already exists.");
                  await router.invalidate();
                } catch (e) {
                  setNotice(e instanceof Error ? e.message : "Unable to create follow-up");
                } finally {
                  setBusyItem("");
                }
              }}
            >{busyItem===x.assessmentId + ":" + x.studentProfileId ? "Creating follow-up…" : followedUp[x.assessmentId + ":" + x.studentProfileId] ? "Follow-up open" : "Create follow-up"}</button>
          </article>
        ))}
        {connected && !items.length && <EmptyState title="No overdue missing work in your assigned classes." />}
      </section>
    </WorkspaceShell>
  );
}

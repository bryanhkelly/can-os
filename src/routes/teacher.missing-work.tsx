import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { getSyntheticTeacherMissingWork, createSyntheticMissingWorkFollowUp } from "@/modules/learning/teacher-missing-work.functions";
import { WorkspaceShell, StatCard, EmptyState } from "@/components/workspace";

export const Route = createFileRoute("/teacher/missing-work")({
  loader: () => getSyntheticTeacherMissingWork(),
  component: TeacherMissingWork,
});

function TeacherMissingWork() {
  const { connected, items } = Route.useLoaderData();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const studentCount = new Set(items.map(x => x.studentProfileId)).size;

  return (
    <WorkspaceShell
      eyebrow="CAN OS · Synthetic teacher"
      title="Missing work"
      subtitle="Overdue work across active students in the demo teacher's assigned sections. Only explicitly synthetic student records are included. This is not an authenticated teacher view."
      actions={<p className="mt-2 text-xs"><Link to="/teacher/notices" className="underline">Teacher notifications →</Link></p>}
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
            <p className="mt-1 text-sm">{x.studentName} · {x.status === "assigned" ? "Assigned but not submitted" : "No attempt recorded"}</p>
            <Link to={"/student/assignments?assessment=" + encodeURIComponent(x.assessmentId)} className="mt-3 inline-block text-xs font-semibold underline">Open student assignment demo →</Link>
            <button
              disabled={busy}
              className="ml-4 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50"
              onClick={async () => {
                setBusy(true);
                try {
                  const result = await createSyntheticMissingWorkFollowUp({ data: { assessmentId: x.assessmentId, studentProfileId: x.studentProfileId } });
                  setNotice(result.created ? "Follow-up added to Operations." : "An open follow-up already exists.");
                  await router.invalidate();
                } catch (e) {
                  setNotice(e instanceof Error ? e.message : "Unable to create follow-up");
                } finally {
                  setBusy(false);
                }
              }}
            >Create follow-up</button>
          </article>
        ))}
        {connected && !items.length && <EmptyState title="No overdue missing work in the assigned synthetic sections." />}
      </section>
    </WorkspaceShell>
  );
}

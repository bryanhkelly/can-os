import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { QueryState } from "@/components/workspace";
import { WorkspaceNavigation } from "@/components/shell/WorkspaceNavigation";
import { MissingAssignmentQueue } from "@/components/learning/MissingAssignmentQueue";
import { TeacherConferencePanel } from "@/components/teacher/TeacherConferencePanel";
import { getTeacherIndexWorkspace } from "@/modules/learning/workspace.functions";
import {
  completeSupportOutreach,
  getTeachingWorkflow,
  saveSupportOutreach,
} from "@/modules/learning/teacher-workspace.functions";

export const Route = createFileRoute("/teacher/")({ component: TeacherHome });

function TeacherHome() {
  const [outreachError, setOutreachError] = useState("");
  const [supportNotes, setSupportNotes] = useState<Record<string, string>>({});
  const workspace = useQuery({
    queryKey: ["teacher-index"],
    queryFn: () => getTeacherIndexWorkspace(),
  });
  const workflow = useQuery({
    queryKey: ["teacher-workflow"],
    queryFn: () => getTeachingWorkflow(),
  });

  const saveOutreach = (actionId: string) => {
    const note = supportNotes[actionId]?.trim();
    if (!note) {
      setOutreachError("Add a note before saving support outreach.");
      return;
    }
    setOutreachError("");
    void saveSupportOutreach({ data: { actionId, note } }).then(async () => {
      setSupportNotes((current) => ({ ...current, [actionId]: "" }));
      await workflow.refetch();
    }).catch((cause) => setOutreachError(cause instanceof Error ? cause.message : "Unable to save outreach"));
  };

  const completeOutreach = (actionId: string) => {
    const note = supportNotes[actionId]?.trim();
    if (!note) {
      setOutreachError("Add a note before completing support outreach.");
      return;
    }
    setOutreachError("");
    void completeSupportOutreach({ data: { actionId, note } }).then(async () => {
      await workflow.refetch();
    }).catch((cause) => setOutreachError(cause instanceof Error ? cause.message : "Unable to complete outreach"));
  };

  if (workspace.isLoading || workflow.isLoading) {
    return <main className="min-h-screen bg-background px-6 py-10 text-foreground">
      <p role="status" className="text-sm">Loading your teacher workspace…</p>
    </main>;
  }

  if (workspace.error || !workspace.data) {
    return <main className="min-h-screen bg-background px-6 py-10 text-foreground">
      <p role="alert" className="rounded-lg border p-4 text-sm">
        {workspace.error instanceof Error ? workspace.error.message : "Teacher workspace unavailable"}
      </p>
    </main>;
  }

  if (workspace.data.redirectTo) {
    return <Navigate to={workspace.data.redirectTo} replace />;
  }

  if (!workspace.data.connected) {
    return <main className="min-h-screen bg-background px-6 py-10 text-foreground">
      <p role="status" className="rounded-lg border p-4 text-sm">{workspace.data.reason}</p>
    </main>;
  }

  const queue = workflow.data?.connected ? workflow.data.missingAssignmentQueue : [];
  const outreachActions = workflow.data?.connected ? workflow.data.supportActions : [];

  return <main className="min-h-screen bg-background px-6 py-10 text-foreground">
    <WorkspaceNavigation />
    <div className="mx-auto max-w-5xl">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">CAN OS · Teacher</p>
      <h1 className="mt-2 font-serif text-4xl">Today for {workspace.data.person.firstName}</h1>

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        {workspace.data.sections.map((section) => <article key={section.sectionId} className="rounded-xl border bg-card p-5">
          <h2 className="text-lg font-semibold">{section.courseTitle}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{section.sectionTitle}</p>
          <p className="mt-3 text-sm">{section.enrollmentCount} enrolled · {section.missingCount} missing</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/teacher/gradebook" className="rounded-lg border px-3 py-2 text-xs font-semibold">Gradebook</Link>
            <Link to="/teacher/missing-work" className="rounded-lg border px-3 py-2 text-xs font-semibold">Missing work</Link>
          </div>
        </article>)}
      </section>

      <MissingAssignmentQueue
        queue={queue}
        title="Missing work needs teacher review"
        description="Missing submissions stay in one queue here and in the gradebook so nothing is lost between pages."
        className="mt-8"
      />

      <section className="mt-10">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Support outreach</p>
        <p className="mt-2 text-sm text-muted-foreground">Log and close teacher support actions without leaving your classroom workspace.</p>
        <QueryState loading={workflow.isLoading ? "Loading support actions…" : undefined}
          error={outreachError || (workflow.error instanceof Error ? workflow.error.message : "")}
          onRetry={() => void workflow.refetch()} retrying={workflow.isFetching}>
          {workflow.data && !workflow.data.connected && <p role="status" className="mt-4 rounded-lg border p-4 text-sm">{workflow.data.reason}</p>}
          {workflow.data?.connected && outreachActions.length === 0 && <p className="mt-4 rounded-lg border p-4 text-sm text-muted-foreground">No open support outreach actions.</p>}
          {outreachActions.length > 0 && <div className="mt-4 grid gap-3">
            {outreachActions.map((action) => <article key={action.actionId} className="rounded-xl border bg-card p-4">
              <p className="font-semibold">{action.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{action.studentName} · {action.status}</p>
              <label className="mt-3 block text-xs font-semibold">Outreach note
                <input className="mt-1 w-full rounded border bg-background p-2 text-sm"
                  value={supportNotes[action.actionId] ?? ""}
                  onChange={(event) => setSupportNotes((current) => ({ ...current, [action.actionId]: event.target.value }))} />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => saveOutreach(action.actionId)}
                  className="rounded border px-3 py-2 text-xs font-semibold">Save outreach</button>
                <button type="button" onClick={() => completeOutreach(action.actionId)}
                  className="rounded border px-3 py-2 text-xs font-semibold">Complete outreach</button>
              </div>
            </article>)}
          </div>}
        </QueryState>
      </section>

      <TeacherConferencePanel />
    </div>
  </main>;
}

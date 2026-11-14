import { useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { getTeacherMissingWork, createMissingWorkFollowUp } from "@/modules/learning/teacher-missing-work.functions";
import { WorkspaceShell, StatCard, EmptyState } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { dateKeyInTimezone, formatDateOnly } from "@/modules/calendar/timezone";

const loadMissingWork = () => getTeacherMissingWork();

export const Route = createFileRoute("/teacher/missing-work")({
  loader: safeLoader(loadMissingWork, { authMessage: "Sign in with an authorized teacher account to view missing work." }),
  component: TeacherMissingWork,
});

function TeacherMissingWork() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) return <LoaderFailure eyebrow="Teacher" title="Missing work" outcome={outcome} />;
  return <TeacherMissingWorkView data={outcome.data} />;
}

function TeacherMissingWorkView({ data }: { data: Awaited<ReturnType<typeof loadMissingWork>> }) {
  const { connected, items } = data;
  const router = useRouter();
  const [followedUp, setFollowedUp] = useState<Record<string, string>>({});
  const [handledElsewhere,setHandledElsewhere]=useState<Record<string,boolean>>({});
  const mutation = useMutationFeedback(() => router.invalidate());
  const busy = mutation.pending || mutation.refreshFailed;
  const studentCount = new Set(items.map(x => x.studentProfileId)).size;

  return (
    <WorkspaceShell
      eyebrow="Teacher"
      title="Missing work"
      subtitle="Overdue missing submissions and returned revisions for actively enrolled students in your classes."
    >
      <MutationFeedback state={mutation} className="mt-4" pendingMessage="Creating follow-up..."/>
      {!connected && <p role="status" className="mt-4 rounded-xl border p-4">Neon is not connected. The queue cannot load.</p>}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <StatCard value={items.length} label="Overdue student-assignment items" />
        <StatCard value={studentCount} label="Students needing follow-up" />
      </div>
      <section className="mt-6 space-y-3">
        {items.map(x => (
          <article key={x.assessmentId + ":" + x.studentProfileId} className="rounded-xl border bg-card p-5">
            <p className="text-xs text-muted-foreground"><Link to="/classes" search={{section:x.sectionId}} className="underline">{x.course}</Link> · due {formatDateOnly(dateKeyInTimezone(x.dueAt,x.timezone))}</p>
            <h2 className="mt-2 font-semibold"><Link to="/teacher/gradebook" search={{section:x.sectionId,assessment:x.assessmentId}} className="underline">{x.title}</Link></h2>
            <p className="mt-2 text-xs"><Link to="/teacher/gradebook" search={{section:x.sectionId}} className="underline">Open class gradebook</Link></p>
            <p className="mt-1 text-sm"><Link to="/staff/students/$personId" params={{personId:x.studentPersonId}} className="underline">{x.studentName}</Link> · {x.status === "returned" ? "Returned for revision; awaiting resubmission" : x.status === "assigned" ? "Assigned but not submitted" : "No attempt recorded"}</p>
            <span className="mt-3 inline-block text-xs text-muted-foreground">Assessment ID: {x.assessmentId.slice(0,8)}</span>
            {(followedUp[x.assessmentId + ":" + x.studentProfileId] || x.followUpActionId) ? (
              <Link to="/actions/$actionId"
                params={{actionId: followedUp[x.assessmentId + ":" + x.studentProfileId] || x.followUpActionId!}}
                className="ml-4 inline-block rounded-lg border px-3 py-2 text-xs font-semibold underline">
                Open follow-up
              </Link>
            ) : handledElsewhere[x.assessmentId + ":" + x.studentProfileId] ? (
              <p role="status" className="ml-4 inline-block text-xs text-muted-foreground">A colleague is handling this follow-up</p>
            ) : (
              <button type="button" disabled={busy}
                className="ml-4 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                onClick={async () => {
                  const result=await mutation.run(
                    () => createMissingWorkFollowUp({data:{
                      assessmentId:x.assessmentId,studentProfileId:x.studentProfileId,
                    }}),
                    {successMessage:value=>value.created
                      ?"Follow-up added to Operations.":value.assignedToAnotherTeacher
                      ?"An existing follow-up is assigned to another teacher.":"Your existing follow-up is open.",
                     commandErrorMessage:"Unable to create follow-up"},
                  );
                  if(result.status==="saved" || result.status==="refresh-failed"){
                    if(result.value.assignedToAnotherTeacher){
                      setHandledElsewhere(previous=>({...previous,[x.assessmentId + ":" + x.studentProfileId]:true}));
                    }else if(result.value.actionId){
                      setFollowedUp(previous=>({...previous,
                        [x.assessmentId + ":" + x.studentProfileId]:result.value.actionId!,
                      }));
                    }
                  }
                }}>
                Create follow-up
              </button>
            )}

          </article>
        ))}
        {connected && !items.length && <EmptyState title="No overdue missing work in your assigned classes." />}
      </section>
    </WorkspaceShell>
  );
}

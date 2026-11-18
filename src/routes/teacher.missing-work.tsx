import { useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { getTeacherMissingWork, createMissingWorkFollowUp } from "@/modules/learning/teacher-missing-work.functions";
import { WorkspaceShell, StatCard, EmptyState, WorkspaceNotice, WorkspacePanel, StatusBadge } from "@/components/workspace";
import { Button } from "@/components/ui/button";
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
      {!connected && <WorkspaceNotice tone="attention" className="mt-4">The school data service is unavailable. The queue cannot load.</WorkspaceNotice>}
      {connected && <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <StatCard value={items.length} label="Overdue student-assignment items" />
        <StatCard value={studentCount} label="Students needing follow-up" />
      </div>}
      <WorkspacePanel className="mt-6" title="Follow-up queue"
        description="Review overdue assignments in your assigned Sections. Follow-ups are recorded in the shared Operations workflow.">
        <ul className="space-y-3">
        {items.map(x => (
          <li key={x.assessmentId + ":" + x.studentProfileId} className="border border-border bg-card p-4 sm:p-5">
            <p className="text-xs text-muted-foreground"><Link to="/classes" search={{section:x.sectionId}} className="underline">{x.course}</Link> · due {formatDateOnly(dateKeyInTimezone(x.dueAt,x.timezone))}</p>
            <h2 className="mt-2 font-semibold"><Link to="/teacher/gradebook" search={{section:x.sectionId,assessment:x.assessmentId,student:x.studentProfileId}} className="underline underline-offset-4">{x.title}</Link></h2>
            <p className="mt-2 text-xs"><Link to="/teacher/gradebook" search={{section:x.sectionId}} className="underline">Open class gradebook</Link></p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <Link to="/staff/students/$personId" params={{personId:x.studentPersonId}}
                className="font-medium underline underline-offset-4">{x.studentName}</Link>
              <StatusBadge tone={x.status === "returned" ? "attention" : "neutral"}>
                {x.status === "returned" ? "Awaiting revision"
                  : x.status === "assigned" ? "Not submitted" : "No attempt recorded"}
              </StatusBadge>
            </div>
            {(followedUp[x.assessmentId + ":" + x.studentProfileId] || x.followUpActionId) ? (
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link to="/actions/$actionId"
                  params={{actionId: followedUp[x.assessmentId + ":" + x.studentProfileId] || x.followUpActionId!}}>
                  Open follow-up
                </Link>
              </Button>
            ) : handledElsewhere[x.assessmentId + ":" + x.studentProfileId] ? (
              <p role="status" className="mt-3 text-sm text-muted-foreground">A colleague is handling this follow-up</p>
            ) : (
              <Button type="button" variant="outline" size="sm" disabled={busy}
                className="mt-3"
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
              </Button>
            )}

          </li>
        ))}
        {connected && !items.length && <EmptyState title="No overdue missing work in your assigned classes." />}
        </ul>
      </WorkspacePanel>
    </WorkspaceShell>
  );
}

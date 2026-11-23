import { opaqueUuidPathParam } from "@/domain/opaque-url-id";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { UnifiedCoursePlayer } from "@/components/learning/UnifiedCoursePlayer";
import { RecordedInstructorWorkspace } from "@/components/learning/RecordedInstructorWorkspace";
import { getMyNoncreditCourseByAttemptId } from "@/modules/enrollment/noncredit-self-enrollment.functions";
import { openMyNoncreditCourse } from "@/modules/enrollment/noncredit-self-enrollment-resume.functions";
import { normalizeClientError } from "@/lib/client-error";
import { Button } from "@/components/ui/button";
import { QueryState, WorkspaceShell } from "@/components/workspace";
import { AuthorizationError } from "@/domain/command-context";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { touchMyNoncreditLearningSession } from "@/modules/enrollment/noncredit-native-session-activity.functions";

export const Route=createFileRoute("/learn/course/$courseAttemptId")({
  params: opaqueUuidPathParam("courseAttemptId"),
  loader:({params})=>safeLoader(async()=>{
    const course=await getMyNoncreditCourseByAttemptId({data:{courseAttemptId:params.courseAttemptId}});
    if(!course)throw new AuthorizationError("current owned noncredit course");
    return course;
  })(),
  component:MyNoncreditCourse,
});

function MyNoncreditCourse(){
  const response=Route.useLoaderData();
  if(!response.ok)return <LoaderFailure title="My noncredit course" outcome={response}/>;
  return <VerifiedCourseAccess key={response.data.courseAttemptId} course={response.data}/>;
}

type NoncreditCourse = NonNullable<Awaited<ReturnType<typeof getMyNoncreditCourseByAttemptId>>>;

/** Both bookmarks and in-app navigation renew the same verified learner session.
 * A saved URL by itself cannot mint a learner grant or access another Person.
 * Promise reuse prevents StrictMode effect replay from issuing duplicate sessions. */
function VerifiedCourseAccess({course}:{course:NoncreditCourse}){
  const [status,setStatus]=useState<"loading"|"ready"|"error">("loading");
  const [error,setError]=useState("");
  const [retry,setRetry]=useState(0);
  const request=useRef<{key:string;promise:ReturnType<typeof openMyNoncreditCourse>}|null>(null);
  useEffect(()=>{
    const key=course.courseAttemptId+":"+retry;
    if(request.current?.key!==key){
      request.current={key,promise:openMyNoncreditCourse({data:{courseAttemptId:course.courseAttemptId}})};
    }
    let mounted=true;
    void request.current.promise.then(()=>{
      if(mounted)setStatus("ready");
    }).catch(cause=>{
      if(mounted){
        setError(normalizeClientError(cause,"Could not restore your learner course session.").message);
        setStatus("error");
      }
    });
    return ()=>{mounted=false;};
  },[course.courseAttemptId,retry]);
  if(status!=="ready")return <WorkspaceShell eyebrow="Learning" width="wide"
    title={course.trainingTitle} subtitle="Restore your verified learner session to continue this course.">
    <QueryState loading={status==="loading"?"Verifying course access…":undefined}
      error={status==="error"?error:undefined}
      onRetry={()=>{
        setError("");setStatus("loading");setRetry(value=>value+1);
      }}/>
    {status==="error"&&<Button asChild variant="outline" className="mt-4">
      <Link to="/learn/my-activity">Return to My Activity</Link>
    </Button>}
  </WorkspaceShell>;
  return <UnifiedCoursePlayer context="training" title={course.trainingTitle}
    subtitle="Your individual Course Attempt keeps lesson progress and practice across recorded instructors. Room pairing is not independently verified attendance."
    actions={<Link to="/learn/my-activity" className="text-sm font-semibold text-primary underline underline-offset-4">My Activity</Link>}
    rail={<div className="space-y-4">
      <section className="border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">Learning tools</h3>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">Choose your recorded teacher, complete published lessons, and save your own practice. Official awards remain governed by the Course and institution.</p>
        <nav className="mt-4 grid gap-3 text-sm" aria-label="Learning navigation">
          <a href="#course-recorded-lessons" className="underline">Lesson outline</a>
          <Link to="/learn/my-activity" className="underline">My Activity</Link>
        </nav>
      </section>
    </div>}>
    <ActiveNoncreditSession courseAttemptId={course.courseAttemptId}/>
    <RecordedInstructorWorkspace courseAttemptId={course.courseAttemptId} mode="training"/>
  </UnifiedCoursePlayer>;
}

function ActiveNoncreditSession({courseAttemptId}:{courseAttemptId:string}) {
  useEffect(()=>{
    let active=true;
    let inFlight=false;
    let nextAttemptAt=0;
    function touch(event:Event){
      if(!active||inFlight||!event.isTrusted||document.visibilityState!=="visible")return;
      const now=Date.now();
      if(now<nextAttemptAt)return;
      // This is a session keepalive, never Course completion or attendance.
      // Only actual trusted interaction can trigger a retry after transient loss.
      inFlight=true;
      nextAttemptAt=now+60_000;
      void touchMyNoncreditLearningSession({data:{courseAttemptId}})
        .catch(()=>{
          if(active)nextAttemptAt=Date.now()+30_000;
        })
        .finally(()=>{inFlight=false;});
    }
    document.addEventListener("pointerdown",touch,{passive:true});
    document.addEventListener("keydown",touch);
    return ()=>{
      active=false;
      document.removeEventListener("pointerdown",touch);
      document.removeEventListener("keydown",touch);
    };
  },[courseAttemptId]);
  return null;
}

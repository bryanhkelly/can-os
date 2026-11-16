import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { UnifiedCoursePlayer } from "@/components/learning/UnifiedCoursePlayer";
import { RecordedInstructorWorkspace } from "@/components/learning/RecordedInstructorWorkspace";
import { getMyNoncreditSelfEnrollments } from "@/modules/enrollment/noncredit-self-enrollment.functions";
import { AuthorizationError } from "@/domain/command-context";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { touchMyNoncreditLearningSession } from "@/modules/enrollment/noncredit-native-session-activity.functions";

export const Route=createFileRoute("/learn/course/$courseAttemptId")({
  loader:({params})=>safeLoader(async()=>{
    const courses=await getMyNoncreditSelfEnrollments();
    const course=courses.find(item=>item.courseAttemptId===params.courseAttemptId);
    if(!course)throw new AuthorizationError("current owned noncredit course");
    return course;
  })(),
  component:MyNoncreditCourse,
});

function MyNoncreditCourse(){
  const response=Route.useLoaderData();
  if(!response.ok)return <LoaderFailure title="My noncredit course" outcome={response}/>;
  const course=response.data;
  return <UnifiedCoursePlayer context="training" title={course.trainingTitle}
    subtitle="Your individual Course Attempt keeps lesson progress and practice across recorded instructors. Room pairing is not independently verified attendance."
    actions={<Link to="/learn/my-courses" className="text-sm font-semibold text-primary underline underline-offset-4">My Classes</Link>}
    rail={<div className="space-y-4">
      <section className="border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">Learning tools</h3>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">Choose your recorded teacher, complete published lessons, and save your own practice. Official awards remain governed by the Course and institution.</p>
        <nav className="mt-4 grid gap-3 text-sm" aria-label="Learning navigation">
          <a href="#course-recorded-lessons" className="underline">Lesson outline</a>
          <Link to="/learn/my-programs" className="underline">My Learning &amp; Programs</Link>
        </nav>
      </section>
    </div>}>
    <ActiveNoncreditSession courseAttemptId={course.courseAttemptId}/>
    <RecordedInstructorWorkspace courseAttemptId={course.courseAttemptId} mode="training"/>
  </UnifiedCoursePlayer>;
}

function ActiveNoncreditSession({courseAttemptId}:{courseAttemptId:string}) {
  useEffect(()=>{
    let lastSentAt=0;
    let unavailable=false;
    function touch(event:Event){
      if(unavailable||!event.isTrusted||document.visibilityState!=="visible")return;
      const now=Date.now();
      if(now-lastSentAt<60_000)return;
      lastSentAt=now;
      void touchMyNoncreditLearningSession({data:{courseAttemptId}})
        .catch(()=>{unavailable=true;});
    }
    document.addEventListener("pointerdown",touch,{passive:true});
    document.addEventListener("keydown",touch);
    return ()=>{
      document.removeEventListener("pointerdown",touch);
      document.removeEventListener("keydown",touch);
    };
  },[courseAttemptId]);
  return null;
}

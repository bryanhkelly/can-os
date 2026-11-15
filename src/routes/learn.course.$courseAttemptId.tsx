import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { WorkspaceShell } from "@/components/workspace";
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
  return <WorkspaceShell eyebrow="My learning" width="wide"
    title={course.trainingTitle}
    subtitle="Your own learning workspace. Classroom room pairing and self-reported activity are not independently verified attendance."
    actions={<Link to="/learn/my-courses" className="text-sm font-semibold text-primary underline underline-offset-4">All my courses</Link>}>
    <div className="mt-6">
      <ActiveNoncreditSession courseAttemptId={course.courseAttemptId}/>
      <RecordedInstructorWorkspace courseAttemptId={course.courseAttemptId}/>
    </div>
  </WorkspaceShell>;
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

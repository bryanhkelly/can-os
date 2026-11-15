import { createFileRoute, Link } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { RecordedInstructorWorkspace } from "@/components/learning/RecordedInstructorWorkspace";
import { getMyNoncreditSelfEnrollments } from "@/modules/enrollment/noncredit-self-enrollment.functions";
import { AuthorizationError } from "@/domain/command-context";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

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
      <RecordedInstructorWorkspace courseAttemptId={course.courseAttemptId}/>
    </div>
  </WorkspaceShell>;
}

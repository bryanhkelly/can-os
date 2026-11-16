import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { WorkspaceShell } from "@/components/workspace";
import { UnifiedCoursePlayer } from "@/components/learning/UnifiedCoursePlayer";
import { UnifiedLessonOutline } from "@/components/learning/UnifiedLessonOutline";
import { RecordedInstructorWorkspace } from "@/components/learning/RecordedInstructorWorkspace";
import { CourseLessonProgress } from "@/components/learning/CourseLessonProgress";
import { getNativeClassLearning } from "@/modules/classes/native-class-learning.functions";

export const Route=createFileRoute("/learn/class/$classEnrollmentId")({
  component:NativeClassLearningPage,
});
function NativeClassLearningPage(){
  const {classEnrollmentId}=Route.useParams();
  const learning=useQuery({
    queryKey:["native-class-learning",classEnrollmentId],
    queryFn:()=>getNativeClassLearning({data:{classEnrollmentId}}),retry:false,
  });
  const data=learning.data;
  if(!data) return <WorkspaceShell width="wide" eyebrow="My CAN · Learning" title="Class learning">
    {learning.isPending?<p role="status" className="mt-6 border border-border bg-card p-5 text-sm">
      Checking your Class enrollment and authorized Course…
    </p>:<p role="alert" className="mt-6 border border-border bg-card p-5 text-sm">
      Your Class, Course Attempt or learner identity is not currently authorized.
    </p>}
  </WorkspaceShell>;
  const completed=data.lessons.filter(x=>x.progressStatus==="completed"||x.progressStatus==="waived").length;
  return <UnifiedCoursePlayer context="native" title={data.classTitle}
    subtitle="One Course Attempt, one learning record. Recorded instructor selection does not change your Class Enrollment, credit eligibility or official results."
    actions={<Link to="/learn/classes" className="text-sm font-semibold text-primary underline underline-offset-4">My Classes</Link>}
    metadata={<>
      <span><strong>Enrollment</strong> · {data.enrollmentStatus}</span>
      <span><strong>Credit participation</strong> · {data.creditMode.replace("_"," ")}</span>
      <span><strong>Course progress</strong> · {completed} of {data.lessons.length}</span>
    </>}
    rail={<div className="space-y-4">
      <section className="border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">Course progress</h3>
        <div className="mt-3"><CourseLessonProgress completed={completed} total={data.lessons.length}
          ariaLabel="Canonical Class lesson progress"
          description="Self-reported lesson completion. This is not a grade, attendance record or automatically issued award."/></div>
        <a href="#course-recorded-lessons" className="mt-3 inline-block text-sm font-semibold underline">Choose a lesson or recorded teacher</a>
      </section>
      <section className="border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">Published lesson sequence</h3>
        <div className="mt-3 max-h-96 overflow-y-auto">
          <UnifiedLessonOutline lessons={data.lessons.map(lesson=>({
            id:lesson.lessonId,title:lesson.lessonTitle,group:lesson.unitTitle,
            status:lesson.progressStatus,
          }))} renderAction={lesson=><span>{lesson.title}</span>}
            label="Class course outline"/>
        </div>
      </section>
      <section className="border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">Your results</h3>
        <p className="mt-2 text-sm">{data.outcomes.length} verified outcomes · {data.awards.filter(x=>!x.revokedAt).length} current awards</p>
        <a href="#class-results" className="mt-3 inline-block text-sm underline">View results and awards</a>
      </section>
    </div>}>
    <section aria-label="Class lesson player">
      <RecordedInstructorWorkspace key={data.courseAttemptId}
        courseAttemptId={data.courseAttemptId} mode="native"/>
    </section>
    <section id="class-results" className="mt-6 border border-border bg-card p-5" aria-label="Individual learning outcomes">
      <h2 className="font-serif text-2xl">Individual outcomes and awards</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Verified learning results are distinct from credit, certificates or credentials issued by an authorized organization.
      </p>
      {data.outcomes.length===0?<p className="mt-4 text-sm text-muted-foreground">No verified results have been recorded.</p>:
        <ul className="mt-4 divide-y divide-border">{data.outcomes.map(x=><li key={x.id} className="py-3 text-sm">
          <span className="font-semibold">{x.kind}</span> · {x.result}
        </li>)}</ul>}
      {data.awards.length>0&&<div className="mt-5 border-t border-border pt-4">
        <h3 className="text-sm font-semibold">Award history</h3>
        <ul className="mt-3 divide-y divide-border">{data.awards.map((award,i)=>
          <li key={award.kind+":"+i} className="py-3 text-sm">
            {award.kind.replaceAll("_"," ")} · {award.revokedAt?"Revoked":"Issued"}
          </li>)}</ul>
      </div>}
    </section>
  </UnifiedCoursePlayer>;
}

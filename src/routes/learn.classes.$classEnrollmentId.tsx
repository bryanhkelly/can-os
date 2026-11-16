import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { WorkspaceShell } from "@/components/workspace";
import { getNativeClassLearning } from "@/modules/classes/native-class-learning.functions";

export const Route=createFileRoute("/learn/classes/$classEnrollmentId")({
  component:NativeClassLearningPage,
});
function NativeClassLearningPage(){
  const {classEnrollmentId}=Route.useParams();
  const learning=useQuery({
    queryKey:["native-class-learning",classEnrollmentId],
    queryFn:()=>getNativeClassLearning({data:{classEnrollmentId}}),retry:false,
  });
  const data=learning.data;
  const completed=data?.lessons.filter(x=>x.progressStatus==="completed"||x.progressStatus==="waived").length??0;
  return <WorkspaceShell width="wide" eyebrow="My CAN · Learning" title={data?.classTitle??"Class learning"}
    subtitle="Your individual Course progress and outcomes. Recorded instructors do not alter your enrollment or official assessments."
    actions={<Link to="/learn/classes" className="text-sm font-semibold text-primary underline underline-offset-4">All my Classes</Link>}>
    {learning.isPending&&<p role="status" className="mt-6 border border-border bg-card p-5 text-sm">Checking your Class enrollment and Course Attempt…</p>}
    {learning.isError&&<p role="alert" className="mt-6 border border-border bg-card p-5 text-sm">
      Your Class is unavailable, or your enrollment, Course rights or identity are no longer authorized.
    </p>}
    {data&&<>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Course progress</p>
          <p className="mt-2 font-serif text-2xl">{completed} / {data.lessons.length}</p>
          <p className="text-xs text-muted-foreground">Lessons completed or waived</p>
        </div>
        <div className="border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Enrollment</p>
          <p className="mt-2 text-lg font-semibold">{data.enrollmentStatus}</p>
          <p className="text-xs text-muted-foreground">{data.creditMode.replace("_"," ")}</p>
        </div>
        <div className="border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Awarded outcomes</p>
          <p className="mt-2 font-serif text-2xl">{data.awards.filter(x=>!x.revokedAt).length}</p>
          <p className="text-xs text-muted-foreground">Official award records, not implied from video playback</p>
        </div>
      </div>
      <section className="mt-6 border border-border bg-card p-5">
        <h2 className="font-serif text-2xl">Course lessons</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This is the canonical Course sequence and your recorded progress. Media playback remains subject to the separately authorized instructional-track delivery service.
        </p>
        <ol className="mt-4 divide-y divide-border border-t border-border">
          {data.lessons.map(item=><li key={item.lessonId} className="grid gap-1 py-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.unitTitle}</p>
              <p className="mt-1 text-sm font-semibold">{item.lessonTitle}</p></div>
            <p className="text-xs text-muted-foreground">{item.progressStatus??"Not started"}</p>
          </li>)}
        </ol>
        {data.lessons.length===0&&<p className="mt-4 text-sm text-muted-foreground">This Course has no published lessons available to your Class yet.</p>}
      </section>
      <section className="mt-6 border border-border bg-card p-5">
        <h2 className="font-serif text-2xl">Individual outcomes</h2>
        {data.outcomes.length===0?<p className="mt-3 text-sm text-muted-foreground">No verified results recorded.</p>:
          <ul className="mt-3 divide-y divide-border">{data.outcomes.map(x=><li key={x.id} className="py-3 text-sm">
            <span className="font-semibold">{x.kind}</span> · {x.result}
          </li>)}</ul>}
        {data.awards.length>0&&<p className="mt-4 text-sm">
          Awards: {data.awards.map(a=>a.kind+(a.revokedAt?" (revoked)":"")).join(", ")}
        </p>}
      </section>
    </>}
  </WorkspaceShell>;
}

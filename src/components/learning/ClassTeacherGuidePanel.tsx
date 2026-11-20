import { WorkspacePanel } from "@/components/workspace";
import type { getClassWorkspace } from "@/modules/learning/class-workspace.functions";

/** Private published teacher-guide view. The parent enforces teacher access
 * before passing in server-authorized private guide data.
 */
type Workspace = Awaited<ReturnType<typeof getClassWorkspace>>;
export function ClassTeacherGuidePanel({
  teacherGuides, content,
}: {
  teacherGuides: Workspace["teacherGuides"];
  content: Workspace["content"];
}) {
  return <div className="grid gap-5">
        {!teacherGuides && <WorkspacePanel title="Teacher guide not published">
          <p className="text-sm">There is no private teacher guide attached to this published course version.</p>
        </WorkspacePanel>}
        {teacherGuides?.units.map(unit=><WorkspacePanel key={unit.unitId} title={`Teacher guide · ${unit.unitId}`}
          description={`Teacher review: ${unit.reviewStatus.replaceAll("_"," ")}. These worked answers are not student-facing instructional content.`}>
          <p className="whitespace-pre-wrap text-sm leading-7">{unit.teacherOverview}</p>
          <div className="mt-4 grid gap-3">{unit.lessons.map(item=><details key={item.lessonId} className=" border p-3">
            <summary className="cursor-pointer text-sm font-semibold">Lesson: {content?.modules.flatMap(module=>module.lessons).find(lesson=>lesson.id===item.lessonId)?.title ?? item.lessonId}</summary>
            <div className="mt-3 space-y-4 text-sm">
              <p className="whitespace-pre-wrap">{item.preparation}</p>
              <section><h3 className="font-semibold">Worked solutions</h3>
                <ul className="mt-2 space-y-2">{item.workedAnswers.map((a,i)=><li key={i} className=" border p-3"><p className="font-semibold">{a.prompt}</p><p className="mt-1 whitespace-pre-wrap">{a.answer}</p></li>)}</ul>
              </section>
              <section><h3 className="font-semibold">Common misconceptions</h3>
                <ul className="mt-2 list-disc space-y-2 pl-5">{item.misconceptions.map((t,i)=><li key={i}>{t}</li>)}</ul>
              </section>
              <section><h3 className="font-semibold">Interventions</h3>
                <ul className="mt-2 list-disc space-y-2 pl-5">{item.interventions.map((t,i)=><li key={i}>{t}</li>)}</ul>
              </section>
              {!!item.extensions.length && <section><h3 className="font-semibold">Extensions</h3>
                <ul className="mt-2 list-disc space-y-2 pl-5">{item.extensions.map((t,i)=><li key={i}>{t}</li>)}</ul>
              </section>}
            </div>
          </details>)}</div>
          <h3 className="mt-5 text-sm font-semibold">Assessment answer guides</h3>
          <div className="mt-2 grid gap-3">{unit.assessments.map(item=><details key={item.assessmentKey} className=" border p-3">
            <summary className="cursor-pointer text-sm font-semibold">{item.title}</summary>
            <div className="mt-3 space-y-3 text-sm">
              {item.answerGuide.map(q=><div key={q.item} className=" border p-3">
                <p className="font-semibold">Item {q.item}</p>
                <p className="mt-1 whitespace-pre-wrap">{q.correctResponse}</p>
                <p className="mt-2 text-muted-foreground">{q.evidenceToLookFor}</p>
              </div>)}
              <p className="whitespace-pre-wrap">{item.scoringNotes}</p>
            </div>
          </details>)}</div>
        </WorkspacePanel>)}
      </div>;
}

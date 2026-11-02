import type { FormEvent } from "react";
import type { getGradebook } from "@/modules/learning/gradebook.functions";
import { MAX_ASSESSMENT_ATTEMPTS } from "@/domain/assessment-attempt-policy";

type Lesson = Awaited<ReturnType<typeof getGradebook>>["curriculumLessons"][number];
export type AssessmentCriterionInput = {id:string;label:string;maxPoints:string;description:string};
export type AssignmentKind = "homework"|"classwork"|"quiz"|"test"|"project"|"discussion";

export function GradebookAssessmentComposer({
  title,points,due,releaseAt,closeAt,assignmentKind,curriculumLessonId,maxAttempts,instructions,
  newRubric,publishConfirmed,busy,lessonContext,lessons,
  onTitleChange,onPointsChange,onDueChange,onReleaseChange,onCloseChange,onKindChange,onLessonChange,
  onAttemptsChange,onInstructionsChange,onRubricChange,onPublishConfirmedChange,onSubmit,
}: {
  title:string;points:string;due:string;releaseAt:string;closeAt:string;
  assignmentKind:AssignmentKind;curriculumLessonId:string;maxAttempts:string;instructions:string;
  newRubric:AssessmentCriterionInput[];publishConfirmed:boolean;busy:boolean;
  lessonContext?:string;lessons:readonly Lesson[];
  onTitleChange:(v:string)=>void;onPointsChange:(v:string)=>void;onDueChange:(v:string)=>void;
  onReleaseChange:(v:string)=>void;onCloseChange:(v:string)=>void;onKindChange:(v:AssignmentKind)=>void;
  onLessonChange:(v:string)=>void;onAttemptsChange:(v:string)=>void;onInstructionsChange:(v:string)=>void;
  onRubricChange:(v:AssessmentCriterionInput[])=>void;onPublishConfirmedChange:(v:boolean)=>void;
  onSubmit:(publish:boolean)=>void;
}) {
  const updateCriterion=(id:string,patch:Partial<AssessmentCriterionInput>)=>
    onRubricChange(newRubric.map(row=>row.id===id?{...row,...patch}:row));
  const submit=(event:FormEvent<HTMLFormElement>)=>event.preventDefault();
  return <details className="mt-8 rounded-xl border bg-card p-5" open={lessonContext?true:undefined}>
    <summary className="cursor-pointer text-lg font-semibold">Create an assessment</summary>
    {lessonContext&&<p className="mt-2 text-sm text-muted-foreground">Creating {assignmentKind} from the selected publisher lesson. This activity belongs to your class, not the publisher's immutable course.</p>}
    {lessonContext&&!lessons.some(lesson=>lesson.id===lessonContext)&&
      <p role="alert" className="mt-2 text-sm">This publisher lesson is unavailable in this class. Choose a listed lesson before creating the assessment.</p>}
    <form onSubmit={submit} className="mt-4" aria-label="New assessment">
      <h2 className="text-lg font-semibold">New assessment</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="text-sm font-semibold">Title<input className="mt-2 w-full rounded-lg border bg-background p-3" value={title} onChange={e=>onTitleChange(e.target.value)} maxLength={200} placeholder="e.g. Chapter 4 quiz"/></label>
        <label className="text-sm font-semibold">Points possible<input className="mt-2 w-full rounded-lg border bg-background p-3" type="number" min={1} max={1000} value={points} onChange={e=>onPointsChange(e.target.value)}/></label>
        <label className="text-sm font-semibold">Due date<input className="mt-2 w-full rounded-lg border bg-background p-3" type="date" value={due} onChange={e=>onDueChange(e.target.value)}/></label>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">Release date and time (optional)<input type="datetime-local" value={releaseAt} onChange={e=>onReleaseChange(e.target.value)} className="mt-2 w-full rounded-lg border bg-background p-3"/></label>
        <label className="text-sm font-semibold">Close submissions (optional)<input type="datetime-local" value={closeAt} onChange={e=>onCloseChange(e.target.value)} className="mt-2 w-full rounded-lg border bg-background p-3"/></label>
        <p className="text-xs text-muted-foreground sm:col-span-2">Times use your device timezone. Publishing without a release time opens work immediately. Work can be submitted after its due date until the close time; no close time leaves submissions open.</p>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">Class activity type
          <select aria-label="Class activity type" value={assignmentKind} onChange={e=>onKindChange(e.target.value as AssignmentKind)} className="mt-2 w-full rounded-lg border bg-background p-3">
            {(["homework","classwork","quiz","test","project","discussion"] as const).map(kind=><option key={kind} value={kind}>{kind}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold">Publisher lesson (optional)
          <select aria-label="Publisher lesson for assignment" value={curriculumLessonId} onChange={e=>onLessonChange(e.target.value)} className="mt-2 w-full rounded-lg border bg-background p-3">
            <option value="">General class activity</option>
            {lessons.map(lesson=><option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}
          </select>
        </label>
      </div>
      <label className="mt-4 block text-sm font-semibold">Maximum attempts (optional)
        <input aria-label="Maximum assignment attempts" type="number" min={1} max={MAX_ASSESSMENT_ATTEMPTS} step={1}
          value={maxAttempts} onChange={e=>onAttemptsChange(e.target.value)} placeholder="No configured limit"
          className="mt-2 block w-48 rounded-lg border bg-background p-3"/>
        <span className="mt-2 block text-xs font-normal text-muted-foreground">Includes the first submission. Each revision still requires a teacher to return the work.</span>
      </label>
      <label className="mt-4 block text-sm font-semibold">Student instructions
        <textarea aria-label="Student assignment instructions" className="mt-2 w-full rounded-lg border bg-background p-3" rows={5} maxLength={20000}
          value={instructions} onChange={e=>onInstructionsChange(e.target.value)} placeholder="Directions, deliverables, submission requirements and allowed resources."/>
      </label>
      <fieldset className="mt-4 rounded-lg border p-4">
        <legend className="px-1 text-sm font-semibold">Scoring rubric (optional)</legend>
        <p className="mb-3 text-xs text-muted-foreground">Add criteria for graded projects, tests, discussions or other work. Criterion points must sum to the assignment's points possible.</p>
        {newRubric.map((criterion,index)=><div key={criterion.id} className="mb-3 grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
          <label className="text-xs font-semibold">Criterion {index+1}
            <input aria-label={"Criterion "+(index+1)+" name"} className="mt-1 w-full rounded border bg-background p-2"
              value={criterion.label} maxLength={120} placeholder="e.g. Mathematical reasoning"
              onChange={e=>updateCriterion(criterion.id,{label:e.target.value})}/>
          </label>
          <label className="text-xs font-semibold">Points
            <input aria-label={"Criterion "+(index+1)+" points"} className="mt-1 w-full rounded border bg-background p-2"
              type="number" min={0.01} step="0.01" max={1000} value={criterion.maxPoints}
              onChange={e=>updateCriterion(criterion.id,{maxPoints:e.target.value})}/>
          </label>
          <button type="button" className="self-end rounded border px-3 py-2 text-xs"
            onClick={()=>onRubricChange(newRubric.filter(row=>row.id!==criterion.id))}>Remove</button>
          <label className="text-xs font-semibold sm:col-span-3">Description (optional)
            <textarea aria-label={"Criterion "+(index+1)+" description"} className="mt-1 w-full rounded border bg-background p-2"
              rows={2} maxLength={1000} value={criterion.description}
              onChange={e=>updateCriterion(criterion.id,{description:e.target.value})}/>
          </label>
        </div>)}
        <button type="button" disabled={newRubric.length>=20} className="rounded border px-3 py-2 text-xs font-semibold disabled:opacity-50"
          onClick={()=>onRubricChange([...newRubric,{id:"criterion-"+crypto.randomUUID(),label:"",maxPoints:"",description:""}])}>
          Add rubric criterion
        </button>
      </fieldset>
      <p className="mt-2 text-xs text-muted-foreground">The assignment belongs to this teacher's class. Linking to a publisher lesson preserves the original curriculum.</p>
      <p className="mt-3 text-xs text-muted-foreground">Due dates are planning information until you explicitly publish. Saving a draft never assigns work, even if it has a due date.</p>
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input type="checkbox" checked={publishConfirmed} onChange={e=>onPublishConfirmedChange(e.target.checked)} disabled={busy}/>
        <span>I reviewed this assignment and understand Publish &amp; assign makes it available to enrolled students now.</span>
      </label>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" disabled={busy} onClick={()=>onSubmit(false)} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">Save draft</button>
        <button type="button" disabled={busy||!due||!publishConfirmed} onClick={()=>onSubmit(true)} className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">Publish &amp; assign</button>
      </div>
    </form>
  </details>;
}

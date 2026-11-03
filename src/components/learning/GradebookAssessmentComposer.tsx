import type { FormEvent } from "react";
import type { getGradebook } from "@/modules/learning/gradebook.functions";
import { MAX_ASSESSMENT_ATTEMPTS } from "@/domain/assessment-attempt-policy";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

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
        <Field label="Title"><Input value={title} onChange={e=>onTitleChange(e.target.value)} maxLength={200} placeholder="e.g. Chapter 4 quiz"/></Field>
        <Field label="Points possible"><Input type="number" min={1} max={1000} value={points} onChange={e=>onPointsChange(e.target.value)}/></Field>
        <Field label="Due date"><Input type="date" value={due} onChange={e=>onDueChange(e.target.value)}/></Field>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Release date and time (optional)"><Input type="datetime-local" value={releaseAt} onChange={e=>onReleaseChange(e.target.value)}/></Field>
        <Field label="Close submissions (optional)"><Input type="datetime-local" value={closeAt} onChange={e=>onCloseChange(e.target.value)}/></Field>
        <p className="text-xs text-muted-foreground sm:col-span-2">Times use your device timezone. Publishing without a release time opens work immediately. Work can be submitted after its due date until the close time; no close time leaves submissions open.</p>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Class activity type">
          <Select value={assignmentKind} onChange={e=>onKindChange(e.target.value as AssignmentKind)}>
            {(["homework","classwork","quiz","test","project","discussion"] as const).map(kind=><option key={kind} value={kind}>{kind}</option>)}
          </Select>
        </Field>
        <Field label="Publisher lesson (optional)">
          <Select value={curriculumLessonId} onChange={e=>onLessonChange(e.target.value)}>
            <option value="">General class activity</option>
            {lessons.map(lesson=><option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}
          </Select>
        </Field>
      </div>
      <Field className="mt-4 max-w-xs" label="Maximum attempts (optional)"
        description="Includes the first submission. Each revision still requires a teacher to return the work.">
        <Input type="number" min={1} max={MAX_ASSESSMENT_ATTEMPTS} step={1}
          value={maxAttempts} onChange={e=>onAttemptsChange(e.target.value)} placeholder="No configured limit"
          />
      </Field>
      <Field className="mt-4" label="Student instructions">
        <Textarea className="min-h-32" rows={5} maxLength={20000}
          value={instructions} onChange={e=>onInstructionsChange(e.target.value)} placeholder="Directions, deliverables, submission requirements and allowed resources."/>
      </Field>
      <fieldset className="mt-4 rounded-lg border p-4">
        <legend className="px-1 text-sm font-semibold">Scoring rubric (optional)</legend>
        <p className="mb-3 text-xs text-muted-foreground">Add criteria for graded projects, tests, discussions or other work. Criterion points must sum to the assignment's points possible.</p>
        {newRubric.map((criterion,index)=><div key={criterion.id} className="mb-3 grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
          <Field label={`Criterion ${index+1}`}>
            <Input
              value={criterion.label} maxLength={120} placeholder="e.g. Mathematical reasoning"
              onChange={e=>updateCriterion(criterion.id,{label:e.target.value})}/>
          </Field>
          <Field label={`Criterion ${index+1} points`}>
            <Input
              type="number" min={0.01} step="0.01" max={1000} value={criterion.maxPoints}
              onChange={e=>updateCriterion(criterion.id,{maxPoints:e.target.value})}/>
          </Field>
          <Button type="button" variant="outline" size="sm" className="self-end"
            onClick={()=>onRubricChange(newRubric.filter(row=>row.id!==criterion.id))}>Remove</Button>
          <Field className="sm:col-span-3" label={`Criterion ${index+1} description (optional)`}>
            <Textarea
              rows={2} maxLength={1000} value={criterion.description}
              onChange={e=>updateCriterion(criterion.id,{description:e.target.value})}/>
          </Field>
        </div>)}
        <Button type="button" variant="outline" size="sm" disabled={newRubric.length>=20}
          onClick={()=>onRubricChange([...newRubric,{id:"criterion-"+crypto.randomUUID(),label:"",maxPoints:"",description:""}])}>
          Add rubric criterion
        </Button>
      </fieldset>
      <p className="mt-2 text-xs text-muted-foreground">The assignment belongs to this teacher's class. Linking to a publisher lesson preserves the original curriculum.</p>
      <p className="mt-3 text-xs text-muted-foreground">Due dates are planning information until you explicitly publish. Saving a draft never assigns work, even if it has a due date.</p>
      <Label className="mt-3 flex items-start gap-2 text-sm leading-6">
        <Checkbox checked={publishConfirmed} onChange={e=>onPublishConfirmedChange(e.target.checked)} disabled={busy}/>
        <span>I reviewed this assignment and understand Publish &amp; assign makes it available to enrolled students now.</span>
      </Label>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button type="button" variant="outline" disabled={busy} onClick={()=>onSubmit(false)}>Save draft</Button>
        <Button type="button" disabled={busy||!due||!publishConfirmed} onClick={()=>onSubmit(true)}>Publish &amp; assign</Button>
      </div>
    </form>
  </details>;
}

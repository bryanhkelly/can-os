import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { PageFrame, RecordHeader, WorkspacePanel, WorkspaceNotice, StatusBadge } from "@/components/workspace";
import { getDemoTeacherRehearsal } from "@/modules/activities/demo-center.functions";
import { demoTeacherIntroVideo } from "@/domain/demo-teacher-intro-video";

export const Route = createFileRoute("/centers/demo/classroom")({
  loader: safeLoader(() => getDemoTeacherRehearsal()),
  component: RehearsalPage,
});

function RehearsalPage() {
  const response = Route.useLoaderData();
  const [step, setStep] = useState(0);
  const [answer, setAnswer] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [presenting, setPresenting] = useState(false);
  if (!response.ok) return <LoaderFailure eyebrow="Teacher rehearsal" title="Lesson preview" outcome={response}/>;
  const lesson = response.data;
  if (!lesson || !lesson.steps.length) return <PageFrame width="wide">
    <p role="status">No saved rehearsal is available.</p>
  </PageFrame>;
  const current = lesson.steps[Math.min(step, lesson.steps.length - 1)];
  return <PageFrame width="wide">
    <RecordHeader eyebrow="Synthetic teacher rehearsal · Not a live class"
      title={lesson.title} subtitle={lesson.activityName}
      breadcrumbs={<Link to="/centers/demo" className="underline">Community Learning Center</Link>}
      status={<StatusBadge tone="neutral">Planning / approval pending</StatusBadge>}/>
    <div className="mt-5 space-y-5">
      <WorkspaceNotice tone="info">This is a teacher practice session using an original video
        and a saved lesson plan. No learners are enrolled, no attendance is recorded,
        and these controls do not publish a class or bypass guardian consent.</WorkspaceNotice>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(16rem,1fr)]">
        <div className="space-y-5">
          <WorkspacePanel title="Recorded lesson introduction" description="Original six-second sample video, packaged with this application for rehearsal only.">
            <video controls preload="metadata" playsInline className="aspect-video w-full border border-border bg-black"
              aria-label="AI and Digital Skills recorded lesson introduction">
              <source src={demoTeacherIntroVideo} type="video/mp4"/>
              Your browser cannot play this sample video.
            </video>
            <p className="mt-3 text-sm text-muted-foreground">For actual class distribution, use the authorized
              curriculum media upload and publication workflow. This sample does not claim R2 upload.</p>
          </WorkspacePanel>
          <WorkspacePanel title={current.title}
            description={`Rehearsal segment ${step+1} of ${lesson.steps.length} · ${current.minutes} minutes`}>
            <div className="space-y-4">
              <div><h3 className="text-sm font-semibold">Teacher facilitation</h3>
                <p className="mt-1 text-sm leading-6">{current.teacherPrompt}</p></div>
              <div><h3 className="text-sm font-semibold">Learner activity</h3>
                <p className="mt-1 text-sm leading-6">{current.learnerTask}</p></div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="min-h-11 border border-border px-4 text-sm font-semibold"
                  disabled={step === 0} onClick={() => {setStep(n=>Math.max(0,n-1));setPresenting(false);}}>Previous segment</button>
                <button type="button" className="min-h-11 border border-border px-4 text-sm font-semibold"
                  disabled={step === lesson.steps.length-1}
                  onClick={() => {setStep(n=>Math.min(lesson.steps.length-1,n+1));setPresenting(false);}}>Next segment</button>
                <button type="button" className="min-h-11 bg-foreground px-4 text-sm font-semibold text-background"
                  aria-pressed={presenting} onClick={() => setPresenting(v=>!v)}>
                  {presenting?"Stop teacher presentation":"Start teacher presentation"}
                </button>
              </div>
              {presenting && <p role="status" className="border border-border bg-muted p-3 text-sm">
                Teacher rehearsal is presenting: {current.title}. This does not create a real classroom session.
              </p>}
            </div>
          </WorkspacePanel>
          <WorkspacePanel title="Practice knowledge check" description="Local rehearsal only. Answers are not student submissions.">
            <fieldset className="space-y-3">
              <legend className="mb-3 font-semibold text-sm">{lesson.check.question}</legend>
              {lesson.check.choices.map((choice,index)=><label key={index}
                className="flex min-h-11 cursor-pointer items-center gap-3 border border-border p-3 text-sm">
                <input type="radio" name="demo-answer" value={index} checked={answer===index}
                  onChange={() => {setAnswer(index);setRevealed(false);}}/>
                {choice}
              </label>)}
            </fieldset>
            <button type="button" className="mt-4 min-h-11 border border-border px-4 text-sm font-semibold"
              disabled={answer===null} onClick={() => setRevealed(true)}>Check response</button>
            {revealed && <p role="status" className="mt-3 border border-border bg-muted p-3 text-sm">
              {answer===lesson.check.correctIndex?"Correct. ":"Review the answer. "}
              {lesson.check.explanation}
            </p>}
          </WorkspacePanel>
        </div>
        <div className="space-y-5">
          <WorkspacePanel title="Lesson objectives" description="Saved with the center's activity record.">
            <ul className="list-disc space-y-2 pl-5 text-sm">
              {lesson.objectives.map(item=><li key={item}>{item}</li>)}
            </ul>
          </WorkspacePanel>
          <WorkspacePanel title="Lesson outline" description="Teacher practice navigation">
            <ol className="space-y-2">
              {lesson.steps.map((item,index)=><li key={item.id}>
                <button type="button" aria-current={step===index?"step":undefined}
                  onClick={() => {setStep(index);setPresenting(false);}}
                  className={`w-full min-h-11 border px-3 py-2 text-left text-sm ${step===index?"border-foreground bg-muted font-semibold":"border-border"}`}>
                  {index+1}. {item.title} · {item.minutes} min
                </button>
              </li>)}
            </ol>
          </WorkspacePanel>
          <WorkspacePanel title="Enrollment" description="Real registration remains governed by CAN OS approval checks.">
            <p className="text-sm">Season status: {lesson.seasonStatus}. Approved sessions,
              safeguarding, staffing and permission publication are required before registration.</p>
            <Link to="/centers/demo" className="mt-3 inline-block text-sm font-semibold underline">
              Return to center programs
            </Link>
          </WorkspacePanel>
        </div>
      </div>
    </div>
  </PageFrame>;
}

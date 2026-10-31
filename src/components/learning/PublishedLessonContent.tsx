import type { ClassContent } from "@/domain/class-content";

type Lesson = ClassContent["modules"][number]["lessons"][number];

export function PublishedLessonContent({ lesson }: { lesson: Lesson }) {
  return <>
    {lesson.estimatedMinutes && <p className="mb-3 text-xs text-muted-foreground">
      Estimated lesson time: {lesson.estimatedMinutes} minutes
    </p>}
    {lesson.learningTargets?.length ? <section className="mb-5 rounded-lg border p-4">
      <h3 className="text-sm font-semibold">Learning targets</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {lesson.learningTargets.map(target => <li key={target}>{target}</li>)}
      </ul>
    </section> : null}
    {lesson.body.trim() && <section className="mb-5" aria-label="Publisher lesson reading" data-learning-content>
      <h3 className="mb-3 text-sm font-semibold">Lesson reading</h3>
      <div className="whitespace-pre-wrap text-sm leading-8">{lesson.body}</div>
    </section>}
    {lesson.activities?.length ? <section aria-label="Lesson activities" data-learning-content className="mb-5">
      <h3 className="mb-3 text-sm font-semibold">Learning activities</h3>
      <ol className="space-y-5">
        {lesson.activities.map((activity,index) => <li key={activity.id} className="rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">{index+1}. {activity.title}</h3>
            <span className="text-xs text-muted-foreground">
              {activity.estimatedMinutes ? `${activity.estimatedMinutes} min · ` : ""}{activity.kind.replaceAll("_"," ")}
            </span>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7">{activity.instructions}</p>
          {activity.evidence === "teacher_review" &&
            <p className="mt-3 text-xs text-muted-foreground">
              Discuss or submit this evidence for teacher review. Opening this step does not grant a grade.
            </p>}
        </li>)}
      </ol>
    </section> : null}
    {!lesson.body.trim() && !lesson.activities?.length &&
      <p className="text-sm text-muted-foreground">No lesson text or activities provided.</p>}
    {lesson.standards?.length ?
      <p className="mt-4 text-xs text-muted-foreground">Learning standards: {lesson.standards.join(", ")}</p> : null}
  </>;
}

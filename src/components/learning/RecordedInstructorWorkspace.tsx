import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ClassVideoPlayer } from "@/components/learning/ClassVideoPlayer";
import { normalizeClientError } from "@/lib/client-error";
import { nextRecordedLessonId, recordedInstructorSelectionIsCurrent, resumeRecordedLessonId } from "@/domain/instructional-tracks";
import {
  completeRecordedCourseLesson,
  getRecordedInstructorPracticeHistory,
  getRecordedInstructionAssetDownload,
  getRecordedLessonInstruction,
  getStudentRecordedInstructors,
  recordRecordedInstructorPractice,
  selectRecordedInstructor,
} from "@/modules/learning/instructional-tracks.functions";

type InstructorCatalog = Awaited<ReturnType<typeof getStudentRecordedInstructors>>;
type SelectedInstruction = Awaited<ReturnType<typeof getRecordedLessonInstruction>>;
type PracticeHistory = Awaited<ReturnType<typeof getRecordedInstructorPracticeHistory>>;

/**
 * Canonical learner workspace. Mount only after the v3.0.1 application-role
 * policies and learner routes are activated. It does not change Section
 * enrollment, official assignments, or grades. Lesson completion updates only
 * the canonical Course-attempt progress shared across recorded presenters.
 */
export function RecordedInstructorWorkspace({ courseAttemptId }: { courseAttemptId: string }) {
  const [catalog, setCatalog] = useState<InstructorCatalog | null>(null);
  const [instruction, setInstruction] = useState<SelectedInstruction | null>(null);
  const [history, setHistory] = useState<PracticeHistory>([]);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const reload = useCallback(async () => {
    const nextCatalog = await getStudentRecordedInstructors({ data: { courseAttemptId } });
    const [nextInstruction, nextHistory] = await Promise.all([
      recordedInstructorSelectionIsCurrent(nextCatalog)
        ? getRecordedLessonInstruction({ data: { courseAttemptId } })
        : Promise.resolve(null),
      getRecordedInstructorPracticeHistory({ data: { courseAttemptId } }),
    ]);
    setCatalog(nextCatalog);
    setInstruction(nextInstruction);
    setHistory(nextHistory);
    setLessonId(previous => nextInstruction
      ? resumeRecordedLessonId(nextInstruction.lessons, previous)
      : null);
  }, [courseAttemptId]);

  useEffect(() => {
    setLoading(true);
    setError("");
    void reload()
      .catch(failure => setError(normalizeClientError(
        failure, "Unable to load recorded instruction.",
      ).message))
      .finally(() => setLoading(false));
  }, [reload]);

  async function selectTeacher(trackVersionId: string) {
    if (!catalog || pending) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await selectRecordedInstructor({ data: {
        requestId: crypto.randomUUID(),
        courseAttemptId,
        trackVersionId,
        expectedRevision: catalog.selection?.revision ?? 0,
      } });
      setAnswers({});
      await reload();
      setNotice("Recorded instructor updated. Your course progress and practice history are preserved.");
    } catch (failure) {
      setError(normalizeClientError(failure, "Unable to change recorded instructor.").message);
    } finally {
      setPending(false);
    }
  }

  async function markLessonComplete(lessonId: string) {
    if (!instruction || pending) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await completeRecordedCourseLesson({ data: {
        requestId: crypto.randomUUID(),
        courseAttemptId,
        lessonId,
        expectedRevision: instruction.selection.revision,
      } });
      const nextLessonId = nextRecordedLessonId(instruction.lessons, lessonId);
      if (nextLessonId) setLessonId(nextLessonId);
      await reload();
      setNotice(nextLessonId
        ? "Lesson completed. Continue with your next unfinished lesson."
        : "Lesson completed. Your course progress is saved across recorded teachers.");
    } catch (failure) {
      setError(normalizeClientError(failure, "Unable to complete this lesson.").message);
    } finally {
      setPending(false);
    }
  }

  async function openTrackResource(assetVersionId: string) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const resource = await getRecordedInstructionAssetDownload({ data: {
        courseAttemptId,
        assetVersionId,
      } });
      window.location.assign(resource.downloadUrl);
    } catch (failure) {
      setError(normalizeClientError(failure, "Unable to open instructional resource.").message);
    } finally {
      setPending(false);
    }
  }

  async function savePractice(material: NonNullable<SelectedInstruction>["materials"][number]) {
    if (!instruction || !catalog?.selection || !material.practice || pending) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await recordRecordedInstructorPractice({ data: {
        requestId: crypto.randomUUID(),
        courseAttemptId,
        courseVersionId: instruction.courseVersionId,
        trackVersionId: instruction.selection.trackVersionId,
        expectedRevision: instruction.selection.revision,
        materialId: material.id,
        responses: material.practice.prompts.map(prompt => ({
          promptKey: prompt.key,
          response: answers[`${material.id}:${prompt.key}`] ?? "",
        })),
      } });
      setAnswers({});
      await reload();
      setNotice("Practice saved. This is separate from official graded assignments.");
    } catch (failure) {
      setError(normalizeClientError(failure, "Unable to save practice.").message);
    } finally {
      setPending(false);
    }
  }

  const currentLesson = instruction?.lessons.find(lesson => lesson.id === lessonId)
    ?? instruction?.lessons[0];
  const currentPractice = instruction?.canManageProgress ? instruction.materials.filter(material =>
    material.materialKind === "practice" &&
    material.courseUnitId === currentLesson?.courseUnitId &&
    material.practice !== null
  ) : [];
  const currentResources = instruction?.materials.filter(material =>
    material.materialKind !== "practice" &&
    material.courseUnitId === currentLesson?.courseUnitId &&
    material.assetVersionId !== null
  ) ?? [];
  const completedCount = instruction?.lessons.filter(
    lesson => lesson.progress?.status === "completed",
  ).length ?? 0;

  return <section aria-label="Recorded instructor" className="space-y-5">
    <div className="border bg-card p-4">
      <h2 className="font-serif text-xl font-semibold">Choose your recorded teacher</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Your lessons, assignments and grades stay with your course. You may have
        different recorded instruction from other learners in the same Section.
      </p>
      {loading ? <p role="status" className="mt-3 text-sm">Loading recorded instruction...</p> :
        catalog && catalog.choices.length > 0
          ? <RecordedInstructorChoices catalog={catalog} pending={pending}
            onSelect={trackVersionId => void selectTeacher(trackVersionId)}/> : <p className="mt-3 text-sm text-muted-foreground">
          No recorded instructors are available for this course yet.
        </p>}
    </div>

    {catalog?.selection && !recordedInstructorSelectionIsCurrent(catalog) &&
      <p role="status" className="border p-3 text-sm">
        Your recorded-teacher selection needs to be renewed under the current course policy.
        Choose an approved instructor above to continue your lessons.
      </p>}
    {error && <p role="alert" className="border p-3 text-sm">{error}</p>}
    {notice && <p role="status" className="border p-3 text-sm">{notice}</p>}

    {instruction && <>
      {instruction.sectionId && <RecordedOfficialCourseLinks sectionId={instruction.sectionId}/>}
      <div className="border bg-card p-4">
        <h3 className="font-semibold">Course lessons</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {completedCount} of {instruction.lessons.length} lessons completed.
          Recorded teacher selection does not reset lesson progress.
        </p>
        <nav aria-label="Recorded course lessons" className="mt-3 flex flex-wrap gap-2">
          {instruction.lessons.map(lesson => <Button key={lesson.id} size="sm"
            variant={currentLesson?.id === lesson.id ? "secondary" : "outline"}
            onClick={() => { setLessonId(lesson.id); setAnswers({}); }}>
            {lesson.title}{lesson.progress?.status === "completed" ? " ✓" : ""}
          </Button>)}
        </nav>
      </div>

      {currentLesson && <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-serif text-xl font-semibold">{currentLesson.title}</h3>
          <RecordedLessonCompletionAction
            allowed={instruction.canManageProgress}
            completed={currentLesson.progress?.status === "completed"}
            waived={currentLesson.progress?.status === "waived"}
            pending={pending}
            onComplete={() => void markLessonComplete(currentLesson.id)}
          />
        </div>
        {currentLesson.presentations.length ? currentLesson.presentations.map(presentation =>
          <ClassVideoPlayer
            key={`${instruction.selection.trackVersionId}:${presentation.assetVersionId}`}
            title={`${currentLesson.title} recording`}
            resourceId={presentation.assetVersionId}
            loadUrl={async () => (await getRecordedInstructionAssetDownload({ data: {
              courseAttemptId,
              assetVersionId: presentation.assetVersionId,
            } })).downloadUrl}
          />,
        ) : <p className="text-sm text-muted-foreground">
          This teacher does not have a recording for the selected lesson.
        </p>}

        {currentResources.length > 0 && <div className="space-y-2 border bg-card p-4">
          <h4 className="font-semibold">Instructional resources</h4>
          <ul className="space-y-2">
            {currentResources.map(resource => <li key={resource.id}>
              <Button size="sm" variant="outline" disabled={pending}
                onClick={() => resource.assetVersionId && void openTrackResource(resource.assetVersionId)}>
                Open {resource.materialKind === "reference" ? "reference" : "instruction"} resource
              </Button>
            </li>)}
          </ul>
        </div>}

        {currentPractice.map(material => <form key={material.id} className="space-y-3 border bg-card p-4"
          onSubmit={event => { event.preventDefault(); void savePractice(material); }}>
          <h4 className="font-semibold">Supplemental practice</h4>
          <p className="text-sm">{material.practice?.instructions}</p>
          {material.practice?.prompts.map(prompt => <label key={prompt.key} className="block space-y-1 text-sm">
            <span className="block font-medium">{prompt.text}</span>
            <textarea className="min-h-24 w-full border bg-background p-3" required
              value={answers[`${material.id}:${prompt.key}`] ?? ""}
              disabled={pending} onChange={event => setAnswers(current => ({
                ...current,
                [`${material.id}:${prompt.key}`]: event.target.value,
              }))}/>
          </label>)}
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving..." : "Save practice"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Optional teacher practice. Official course assignments and grades are unchanged.
          </p>
        </form>)}
      </div>}
    </>}

    {history.length > 0 && <RecordedPracticeHistory history={history}/>}
  </section>;
}


export function RecordedInstructorChoices({ catalog, pending, onSelect }: {
  catalog: InstructorCatalog;
  pending: boolean;
  onSelect: (trackVersionId: string) => void;
}) {
  return <div className="mt-4 flex flex-wrap gap-2">
    {catalog.choices.map(choice => {
      const selected = choice.trackVersionId === catalog.selection?.trackVersionId;
      const needsRenewal = selected && choice.policyVersionId !== catalog.selection?.policyVersionId;
      const switchingLocked = Boolean(catalog.selection && !selected && !choice.allowSwitching);
      return <Button key={choice.trackVersionId} size="sm"
        variant={selected && !needsRenewal ? "default" : "outline"}
        disabled={pending || switchingLocked || (selected && !needsRenewal)}
        aria-pressed={selected && !needsRenewal}
        title={switchingLocked ? "This course does not permit switching recorded teachers." : undefined}
        onClick={() => onSelect(choice.trackVersionId)}>
        {choice.title}{needsRenewal ? " (renew selection)" : selected ? " (selected)" : switchingLocked ? " (switching unavailable)" : ""}
      </Button>;
    })}
  </div>;
}

export function RecordedLessonCompletionAction({ allowed, completed, waived, pending, onComplete }: {
  allowed: boolean;
  completed: boolean;
  waived: boolean;
  pending: boolean;
  onComplete: () => void;
}) {
  if (!allowed) return null;
  return <Button type="button" size="sm" variant={completed || waived ? "secondary" : "default"}
    disabled={pending || completed || waived} onClick={onComplete}>
    {waived ? "Lesson waived" : completed ? "Lesson completed" : pending ? "Saving..." : "Mark lesson complete"}
  </Button>;
}

export function RecordedOfficialCourseLinks({ sectionId }: { sectionId: string }) {
  return <nav aria-label="Official course records" className="flex flex-wrap gap-4 border bg-card p-4 text-sm">
    <Link to="/classes" search={{ section: sectionId, tab: "lessons" }} className="underline">Official class lessons</Link>
    <Link to="/student/assignments" search={{ section: sectionId }} className="underline">Assignments and feedback</Link>
    <Link to="/student/courses" search={{ section: sectionId, tab: "grades" }} className="underline">Grades</Link>
  </nav>;
}

export function RecordedPracticeHistory({ history }: { history: PracticeHistory }) {
  return <section aria-label="Practice history" className="border bg-card p-4">
    <h3 className="font-semibold">Practice history</h3>
    <p className="mt-1 text-sm text-muted-foreground">
      {history.length} saved practice {history.length === 1 ? "attempt" : "attempts"}.
      Switching teachers does not erase this history or change official grades.
    </p>
    <ol className="mt-3 divide-y">
      {history.map(attempt => <li key={attempt.id} className="py-3 text-sm">
        <details>
          <summary className="cursor-pointer">
            <strong>{attempt.courseUnitTitle ?? "Course unit"}</strong>
            <span className="ml-2 text-muted-foreground">· {attempt.trackTitle ?? "Recorded teacher"}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {new Date(attempt.recordedAt).toISOString().slice(0, 10)}
            </span>
          </summary>
          {attempt.answers.length ? <ol className="mt-3 space-y-3 border-l pl-4">
            {attempt.answers.map((answer, index) => <li key={`${answer.promptKey}:${index}`}>
              <p className="font-medium">{answer.promptText}</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{answer.response}</p>
            </li>)}
          </ol> : <p className="mt-2 text-xs text-muted-foreground">
            Saved responses are not available for this attempt.
          </p>}
        </details>
      </li>)}
    </ol>
  </section>;
}

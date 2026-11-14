import { saveAssignmentWork, submitAssignmentWork } from "@/modules/student-experience/submit-assignment-work";
import { AssignmentAttemptHistory } from "@/components/student/AssignmentAttemptHistory";
import { useEffect, useRef, useState } from "react";
import { SubmissionAnnotations } from "@/components/learning/SubmissionAnnotations";
import { AssignmentConversation } from "@/components/learning/AssignmentConversation";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { getAssignmentDetail, saveAssignmentResponse, saveAssignmentDraft } from "@/modules/student-experience/assignments.functions";
import { createSubmissionAttachmentUpload, attachDocumentToSubmission, listSubmissionAttachments, getSubmissionAttachmentDownload } from "@/modules/learning/submission-attachments.functions";
import { listAssessmentResources, getAssessmentResourceDownload } from "@/modules/learning/assessment-resources.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { PageFrame, RecordHeader, RecordLayout, WorkspacePanel, StatusBadge, WorkspaceNotice } from "@/components/workspace";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { useHydrated } from "@/lib/use-hydrated";
import { createPrivateUploadTask, documentUploadPolicy } from "@/platform/storage/private-upload";
import { attachmentAccept, attachmentMimeForFileName as attachmentMime, MAX_ATTACHMENT_BYTES } from "@/modules/learning/attachment-mimes";
import { mutationErrorMessage, useMutationFeedback } from "@/lib/mutation-feedback";
import { formatTimestamp } from "@/modules/calendar/timezone";

export const Route = createFileRoute("/student/assignments_/$assessmentId")({
 validateSearch: (search: Record<string, unknown>): { filter?: "all" | "todo" | "missing" | "submitted" | "feedback"; section?: string } => ({
  filter: search.filter === "all" || search.filter === "todo" || search.filter === "missing" || search.filter === "submitted" || search.filter === "feedback" ? search.filter : undefined,
  section: typeof search.section === "string" ? search.section : undefined,
 }),
 loader: ({ params }) => safeLoader(
  () => getAssignmentDetail({ data: { assessmentId: params.assessmentId } }),
  { authMessage: "Sign in with an authorized student account to view this assignment." },
 )(),
 component: AssignmentDetailPage,
});

type DetailData = Awaited<ReturnType<typeof getAssignmentDetail>>;
type Assignment = NonNullable<DetailData["assignment"]>;

function formatDate(value: string | null, timeZone?: string) {
 return value ? formatTimestamp(value, timeZone ?? "UTC") : "No due date";
}
function formatDay(value: string | null, timeZone?: string) {
 return value ? formatTimestamp(value, timeZone ?? "UTC", { dateStyle: "full" }) : "—";
}
function formatTime(value: string | null, timeZone?: string) {
 return value ? formatTimestamp(value, timeZone ?? "UTC", { timeStyle: "short", timeZoneName: "short" }) : "—";
}

const ASSIGNMENT_KIND_LABELS: Record<string, string> = {
 homework: "Homework", classwork: "Classwork", quiz: "Quiz",
 test: "Test", project: "Project", discussion: "Discussion",
};

function AssignmentDetailPage() {
 const result = Route.useLoaderData();
 const { filter, section } = Route.useSearch();
 if (!result.ok) return <LoaderFailure eyebrow="Student learning" title="Assignment" outcome={result} />;
 if (!result.data.connected) return <LoaderFailure eyebrow="Student learning" title="Assignment"
  outcome={{ authError: null, message: "School records are currently unavailable.", kind: "unavailable", retryable: true }} />;
 if (!result.data.assignment) return <LoaderFailure eyebrow="Student learning" title="Assignment"
  outcome={{ authError: null, message: "This assignment is unavailable. It may be unreleased or outside your current classes.", kind: "authorization" }} />;
 return <AssignmentDetailView key={result.data.assignment.assessmentId}
  assignment={result.data.assignment} instructorNames={result.data.instructorNames}
  filter={filter} section={section} />;
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
 return <div className="flex items-start justify-between gap-3 border-b border-border/60 py-2 text-sm last:border-b-0">
  <dt className="text-muted-foreground">{label}</dt>
  <dd className="min-w-0 text-right font-semibold">{children}</dd>
 </div>;
}

function AssignmentResourcesPanel({ assessmentId, onError }: { assessmentId: string; onError: (message: string) => void }) {
 const [resources, setResources] = useState<{ documentId: string; fileName: string; mimeType: string | null }[]>([]);
 useEffect(() => {
  let active = true;
  listAssessmentResources({ data: { assessmentId } })
   .then(result => { if (active) setResources(result.resources); })
   .catch(() => { if (active) setResources([]); });
  return () => { active = false; };
 }, [assessmentId]);
 if (!resources.length) return null;
 return <WorkspacePanel title="Assignment resources" description="Materials your teacher attached for this assignment.">
  <ul className="divide-y divide-border/60">
   {resources.map(resource => <li key={resource.documentId} className="flex items-center justify-between gap-3 py-3 text-sm">
    <span className="min-w-0 font-semibold break-words">{resource.fileName}</span>
    <button type="button" className="shrink-0 text-sm font-semibold text-primary underline"
     onClick={async () => {
      try {
       const download = await getAssessmentResourceDownload({ data: { assessmentId, documentId: resource.documentId } });
       window.location.assign(download.downloadUrl);
      } catch (cause) { onError(mutationErrorMessage(cause, "Unable to open this resource")); }
     }}>View</button>
   </li>)}
  </ul>
 </WorkspacePanel>;
}

function AssignmentDetailView({ assignment, instructorNames, filter, section }: {
 assignment: Assignment; instructorNames: string[];
 filter?: "all" | "todo" | "missing" | "submitted" | "feedback"; section?: string;
}) {
 const router = useRouter();
 const mutation = useMutationFeedback(() => router.invalidate());
 const busy = mutation.pending || mutation.refreshFailed;
 const notice = mutation.notice;
 const [progress, setProgress] = useState("");
 const [submittedReceipt, setSubmittedReceipt] = useState<string | null>(null);
 const [error, setError] = useState("");
 const [draftStatus, setDraftStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
 const [pendingFiles, setPendingFiles] = useState<File[]>([]);
 const [attachments, setAttachments] = useState<{ documentId: string; fileName: string }[]>([]);
 const saveGeneration = useRef(0);
 const feedbackRef = useRef<HTMLParagraphElement>(null);
 const saving = useRef(false);
 const uploads = useRef(new Map<File, { run: () => Promise<unknown> }>());
 const hydrated = useHydrated();
 useEffect(() => {
  if (error || notice || mutation.error) feedbackRef.current?.focus();
 }, [error, notice, mutation.error]);
 const [draft, setDraft] = useState(() => assignment.responseText ?? "");
 const nextAttempt = assignment.status === "returned" ? (assignment.attemptNumber ?? 1) + 1 : assignment.attemptNumber ?? 1;
 const attemptLimitReached = Boolean(assignment.metadata.maxAttempts !== null && nextAttempt > assignment.metadata.maxAttempts);
 const editable = assignment.canEdit === true && !submittedReceipt;
 const canSubmit = draft.trim().length >= 3 || pendingFiles.length > 0 ||
  (assignment.status === "assigned" && attachments.length > 0);
 useEffect(() => {
  let active = true;
  listSubmissionAttachments({ data: { assessmentId: assignment.assessmentId } })
   .then(result => { if (active) setAttachments(result.attachments); })
   .catch(() => { if (active) { setAttachments([]); setError("Unable to load this assignment's attachments."); } });
  return () => { active = false; };
 }, [assignment.assessmentId]);
 useEffect(() => {
  if (!hydrated || !editable || busy || draft === (assignment.responseText ?? "")) return;
  const generation = ++saveGeneration.current;
  const task = setTimeout(() => {
   if (generation !== saveGeneration.current) return;
   setDraftStatus("saving");
   saveAssignmentDraft({ data: { assessmentId: assignment.assessmentId, text: draft } })
    .then(() => { if (generation === saveGeneration.current) setDraftStatus("saved"); })
    .catch(() => { if (generation === saveGeneration.current) setDraftStatus("error"); });
  }, 950);
  return () => { clearTimeout(task); saveGeneration.current++; };
 }, [assignment.assessmentId, assignment.status, assignment.responseText, editable, busy, draft, hydrated]);
 async function saveWork(submitFinal: boolean) {
  if (saving.current) return;
  if (!editable) {
   setError("This assignment is no longer editable. Reload to review its current status.");
   return;
  }
  if (submitFinal && !canSubmit) {
   setError("Write at least three characters or choose a file before submitting.");
   return;
  }
  saving.current = true;
  saveGeneration.current++;
  setError(""); setProgress("Saving your draft...");
  try {
   await mutation.run(async () => {
    const work = {
     files: pendingFiles,
     saveDraft: () => saveAssignmentDraft({ data: { assessmentId: assignment.assessmentId, text: draft } }),
     attach: async (file: File) => {
      setProgress("Uploading " + file.name + "...");
      const contentType = attachmentMime(file.name);
      if (!contentType)
       throw new Error("Unsupported file type or size: " + file.name);
      let task = uploads.current.get(file);
      if (!task) {
       task = createPrivateUploadTask({
        file, contentType, policy: documentUploadPolicy,
        begin: () => createSubmissionAttachmentUpload({ data: {
         assessmentId: assignment.assessmentId, fileName: file.name, contentType, sizeBytes: file.size,
        } }),
        finish: upload => {
         setProgress("Verifying " + file.name + "...");
         return attachDocumentToSubmission({ data: { assessmentId: assignment.assessmentId, documentId: upload.documentId } });
        },
       });
       uploads.current.set(file, task);
      }
      await task.run();
     },
     attached: (file: File) => setPendingFiles(current => current.filter(item => item !== file)),
    };
    if (submitFinal) {
     const receipt = await submitAssignmentWork({ ...work, submit: () => {
      setProgress("Submitting your assignment...");
      return saveAssignmentResponse({ data: { assessmentId: assignment.assessmentId, text: draft } });
     } });
     setSubmittedReceipt(receipt.submissionId);
     return receipt.submissionId;
    } else {
     await saveAssignmentWork(work);
     setDraftStatus("saved");
     return null;
    }
   }, {
    successMessage: receipt => receipt ? "Your assignment has been submitted. Receipt: " + receipt :
     "Draft and attached files saved. You can return to continue before submitting.",
    commandErrorMessage: (submitFinal ? "Unable to confirm assignment submission." : "Unable to confirm draft save.") +
     " Your response and pending files are retained; review the current status before retrying.",
    refresh: async () => {
     const updatedFiles = await listSubmissionAttachments({ data: { assessmentId: assignment.assessmentId } });
     setAttachments(updatedFiles.attachments);
     await router.invalidate();
    },
   });
  } finally { saving.current = false; setProgress(""); }
 }
 const content = assignment.metadata.content;
 const criteria = assignment.metadata.criteria ?? [];
 const criteriaTotal = criteria.reduce((sum, criterion) => sum + criterion.maxPoints, 0);
 const statusTone = assignment.timeliness === "missing" ? "attention" : assignment.status === "graded" ? "success" : assignment.status === "submitted" ? "info" : "neutral";
 const statusLabel = (assignment.status ?? "Not submitted") + (assignment.timeliness === "missing" ? " · Missing" : assignment.timeliness === "late" ? " · Late" : "");
 const kindLabel = ASSIGNMENT_KIND_LABELS[assignment.metadata.assignmentKind] ?? assignment.metadata.assignmentKind;
 const points = assignment.pointsPossible !== null && assignment.pointsPossible !== undefined ? Number(assignment.pointsPossible) : null;
 return <PageFrame width="wide">
  <RecordLayout
   header={<RecordHeader
    breadcrumbs={<>
    <Link to="/home" className="underline">Student Today</Link><span>/</span>
    <Link to="/classes" search={{ section: assignment.sectionId, tab: "lessons", lesson: assignment.metadata.curriculumLessonId ?? undefined }} className="underline">{assignment.course}</Link><span>/</span>
     <Link to="/student/assignments" search={{ filter, section }} className="underline">Assignments</Link><span>/</span>
     <span>{assignment.title}</span>
    </>}
    eyebrow={assignment.metadata.curriculumLessonTitle
     ? `${assignment.course} / ${assignment.metadata.curriculumLessonTitle}` : assignment.course}
    title={assignment.title}
    status={<StatusBadge tone={statusTone}>{statusLabel}</StatusBadge>}
    subtitle={<>
     {content?.description && <p className="max-w-3xl">{content.description}</p>}
     <span className="mt-3 flex flex-wrap gap-2">
      <StatusBadge>{kindLabel}</StatusBadge>
      {points !== null && <StatusBadge>{points} points</StatusBadge>}
      {assignment.metadata.maxAttempts !== null && <StatusBadge>Attempt {assignment.attemptNumber ?? 1} of {assignment.metadata.maxAttempts}</StatusBadge>}
     </span>
    </>}
   />}
   main={<>
    <WorkspacePanel title="Assignment overview">
     {content?.overview.length
      ? content.overview.map((paragraph, index) => <p key={index} className="mt-3 first:mt-0 text-sm leading-7 text-muted-foreground">{paragraph}</p>)
      : <p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{assignment.instructions ?? "Follow your teacher's instructions."}</p>}
     {content?.prompt && <blockquote className="mt-5 border-l-2 border-primary bg-accent/40 px-4 py-3 font-serif text-lg italic leading-snug">
      {content.prompt}
     </blockquote>}
     {content?.overview.length ? assignment.instructions && <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{assignment.instructions}</p> : null}
     {content?.objectives.length ? <>
      <h3 className="mt-6 text-sm font-semibold">Learning objectives</h3>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
       {content.objectives.map((objective, index) => <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
        <span aria-hidden="true" className="font-semibold text-success">✓</span>{objective}
       </li>)}
      </ul>
     </> : null}
     {assignment.metadata.curriculumLessonId && <Link to="/classes"
      search={{ section: assignment.sectionId, tab: "lessons", lesson: assignment.metadata.curriculumLessonId }}
      className="mt-4 inline-block text-sm underline">Review publisher lesson: {assignment.metadata.curriculumLessonTitle ?? assignment.metadata.curriculumLessonId}</Link>}
    </WorkspacePanel>
    {content?.steps.length ? <WorkspacePanel title="What you'll do">
     <ol className="divide-y divide-border/60">
      {content.steps.map((step, index) => <li key={index} className="flex items-start gap-4 py-3 text-sm">
       <span aria-hidden="true" className="min-w-7 pt-0.5 text-xs font-semibold text-primary">{String(index + 1).padStart(2, "0")}</span>
       <span className="text-muted-foreground"><strong className="text-foreground">{step.title}</strong>{step.detail ? ` ${step.detail}` : ""}</span>
      </li>)}
     </ol>
     {content.formatNote && <p className="mt-4 border-l-2 border-border bg-muted px-4 py-3 text-sm text-muted-foreground"><strong className="text-foreground">Format:</strong> {content.formatNote}</p>}
    </WorkspacePanel> : null}
    {criteria.length > 0 && <WorkspacePanel title="Grading rubric">
    <div className="overflow-x-auto">
    <table className="w-full min-w-[38rem] border-collapse text-sm">
      <thead>
       <tr className="border-b border-border text-left text-xs uppercase tracking-eyebrow text-muted-foreground">
        <th scope="col" className="py-2 pr-3 font-semibold">Criteria</th>
        <th scope="col" className="py-2 pr-3 font-semibold">What strong work demonstrates</th>
        <th scope="col" className="py-2 text-right font-semibold">Points</th>
       </tr>
      </thead>
      <tbody>
       {criteria.map(criterion => <tr key={criterion.id} className="border-b border-border/60">
        <td className="py-3 pr-3 font-semibold">{criterion.label}</td>
        <td className="py-3 pr-3 text-muted-foreground">{criterion.description ?? "—"}</td>
        <td className="py-3 text-right whitespace-nowrap">{criterion.maxPoints}</td>
       </tr>)}
       <tr className="bg-muted">
        <td colSpan={2} className="py-3 pr-3 font-semibold">Total</td>
        <td className="py-3 text-right font-semibold">{criteriaTotal}</td>
       </tr>
      </tbody>
    </table>
    </div>
    </WorkspacePanel>}
    {!criteria.length && assignment.metadata.rubric && <WorkspacePanel title="Grading rubric">
     <p className="whitespace-pre-wrap text-sm text-muted-foreground">{assignment.metadata.rubric}</p>
    </WorkspacePanel>}
    <WorkspacePanel title="Your work" id="your-work">
     {assignment.submissionId && ["submitted", "graded", "returned"].includes(assignment.status ?? "") && <p className="text-sm text-muted-foreground">
      Submitted {formatDate(assignment.submittedAt, assignment.timezone)} · Receipt: {assignment.submissionId}
     </p>}
     {attemptLimitReached && <p role="status" className="mt-3 text-sm">This assignment's attempt limit has been reached. Contact your teacher about next steps.</p>}
     {!assignment.workAvailability.actionable && <p className="mt-3 text-sm" role="status">
      {assignment.workAvailability.reason === "unreleased"
       ? "Opens " + formatDate(assignment.availableAt, assignment.timezone)
       : "Closed for student work. Your saved work and feedback remain available."}
     </p>}
     {assignment.feedbackText && <div className="mt-4 bg-muted p-4"><p className="text-sm font-semibold">Teacher feedback</p><p className="mt-2 whitespace-pre-wrap text-sm">{assignment.feedbackText}</p></div>}
     {assignment.revisionFeedbackText && <div className="mt-4 border border-border p-4" role="status">
      <p className="text-sm font-semibold">Previous teacher feedback — guidance for your revision</p>
      <p className="mt-2 whitespace-pre-wrap text-sm">{assignment.revisionFeedbackText}</p>
     </div>}
     {assignment.submissionId && ["graded", "returned"].includes(assignment.status ?? "") && <SubmissionAnnotations key={assignment.submissionId} submissionId={assignment.submissionId} />}
     {assignment.revisionFeedbackSubmissionId && <SubmissionAnnotations
      key={assignment.revisionFeedbackSubmissionId} submissionId={assignment.revisionFeedbackSubmissionId} />}
     {attachments.length > 0 && <div className="mt-4 border border-border p-3"><p className="text-sm font-semibold">Attached files</p>{attachments.map(file => <button type="button" key={file.documentId}
      className="mt-1 block text-xs underline" onClick={async () => {
       try {
        const download = await getSubmissionAttachmentDownload({ data: { assessmentId: assignment.assessmentId, documentId: file.documentId } });
        window.location.assign(download.downloadUrl);
       } catch (cause) { setError(mutationErrorMessage(cause, "Unable to open attachment")); }
      }}>{file.fileName}</button>)}</div>}
     {editable ? <div className="mt-5" aria-busy={busy}>
      <label className="text-sm font-semibold">Your response (optional when submitting a file)
       <textarea disabled={!hydrated || busy} rows={8} value={draft} maxLength={20000} onChange={event => { setDraft(event.target.value); setDraftStatus("idle"); }}
        className="mt-2 block w-full rounded-xl border bg-background p-3 text-sm" placeholder="Write your response…" />
      </label>
      <p aria-live="polite" className="mt-2 text-xs text-muted-foreground">Draft: {draftStatus === "saving" ? "Saving…" : draftStatus === "saved" ? "Saved" : draftStatus === "error" ? "Could not autosave" : "Ready"}</p>
      <label className="mt-4 block text-sm font-semibold">Attachments (PDF, PNG or JPEG; maximum 10 MB each)
       <input type="file" multiple accept={attachmentAccept} disabled={!hydrated || busy}
        onChange={event => setPendingFiles(Array.from(event.target.files ?? []))}
        className="mt-2 block w-full rounded-lg border p-2 text-xs" />
      </label>
      {pendingFiles.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Not yet uploaded: {pendingFiles.map(file => file.name).join(", ")}. Choose Save draft or Submit assignment to save these files.</p>}
      <button type="button" disabled={!hydrated || busy} onClick={() => saveWork(false)}
       className="mr-3 mt-4 rounded-lg border px-5 py-3 text-sm font-semibold disabled:opacity-40">Save draft</button>
      <button type="button" disabled={!hydrated || busy || !canSubmit} onClick={() => saveWork(true)}
       className="mt-4 rounded-lg bg-foreground px-5 py-3 text-sm font-semibold text-background disabled:opacity-40">{busy ? "Saving assignment..." : "Submit assignment"}</button>
     </div> : !submittedReceipt && !["submitted", "graded"].includes(assignment.status ?? "") && assignment.workAvailability.actionable && !attemptLimitReached
      ? <p className="mt-5 bg-muted p-4 text-sm">Your submission is not currently editable. Review its status and feedback above.</p> : null}
     {error && <WorkspaceNotice ref={feedbackRef} tone="danger" className="mt-4">{error}</WorkspaceNotice>}
     <div tabIndex={-1} ref={feedbackRef} className="mt-4">
      <MutationFeedback state={mutation} pendingMessage={progress || "Saving assignment..."} />
     </div>
    </WorkspacePanel>
    <AssignmentConversation key={`conversation-${assignment.assessmentId}`} assessmentId={assignment.assessmentId} />
    {assignment.attempts.length > 1 && <AssignmentAttemptHistory key={JSON.stringify([assignment.assessmentId, assignment.attempts])} assessmentId={assignment.assessmentId} />}
   </>}
   rail={<>
    <WorkspacePanel title="Your assignment">
     <dl>
      <DetailRow label="Due date">{formatDay(assignment.dueAt, assignment.timezone)}</DetailRow>
      <DetailRow label="Due time">{formatTime(assignment.dueAt, assignment.timezone)}</DetailRow>
      <DetailRow label="Assigned">{assignment.availableAt ? formatDay(assignment.availableAt, assignment.timezone) : "—"}</DetailRow>
      <DetailRow label="Instructor">{instructorNames.length ? instructorNames.join(", ") : "—"}</DetailRow>
      {points !== null && <DetailRow label="Points">{points}</DetailRow>}
      {assignment.metadata.maxAttempts !== null && <DetailRow label="Attempts">{(assignment.attemptNumber ?? 1) + " of " + assignment.metadata.maxAttempts}</DetailRow>}
      <DetailRow label="Accepted files">PDF, PNG or JPEG · {MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB each</DetailRow>
      {assignment.score !== null && assignment.score !== undefined && <DetailRow label="Score">{assignment.score}{points !== null ? ` / ${points}` : ""}</DetailRow>}
     </dl>
     {editable && <a href="#your-work" className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Start submission →</a>}
     <p className="mt-3 text-center text-xs text-muted-foreground">Submissions are accepted until the assignment closes.</p>
    </WorkspacePanel>
    <AssignmentResourcesPanel assessmentId={assignment.assessmentId} onError={setError} />
   </>}
  />
 </PageFrame>;
}

import { useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import {
  submitTeacherClassRequest,
  type getTeacherClassRequestOptions,
} from "@/modules/programs/section-creation-requests.functions";

type Options = Awaited<ReturnType<typeof getTeacherClassRequestOptions>>;

export function ClassCreationRequestForm({ options }: { options: Options }) {
  const router = useRouter();
  const mutation = useMutationFeedback(() => router.invalidate());
  const busy = mutation.pending || mutation.refreshFailed;
  const requestId = useRef<string | null>(null);
  const [programId, setProgramId] = useState(options.programs[0]?.id ?? "");
  const [requestedClassTitle, setRequestedClassTitle] = useState("");
  const [requestedCourseOrSubject, setRequestedCourseOrSubject] = useState("");
  const [desiredTerm, setDesiredTerm] = useState("");
  const [schedulePreference, setSchedulePreference] = useState("");
  const [notes, setNotes] = useState("");
  const [attempted, setAttempted] = useState(false);

  function resetRequestId() {
    requestId.current = null;
  }

  function clearSavedDraft() {
    requestId.current = null;
    setAttempted(false);
    setRequestedClassTitle("");
    setRequestedCourseOrSubject("");
    setDesiredTerm("");
    setSchedulePreference("");
    setNotes("");
  }

  async function retryRefresh() {
    const outcome = await mutation.retryRefresh();
    if (outcome.status === "refreshed") clearSavedDraft();
    return outcome;
  }

  return (
    <section className="mt-7 rounded-xl border bg-card p-5" aria-labelledby="class-request-title">
      <h2 id="class-request-title" className="font-serif text-2xl">Request a class</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Send a class setup request to your registrar. The registrar will select approved curriculum,
        confirm the term and schedule, and create the class after the usual school checks.
      </p>
      {!options.programs.length ? (
        <p role="status" className="mt-4 rounded-lg border p-3 text-sm">
          This teacher account is not scoped to a school program yet. Ask your school administrator
          to set up your program access before requesting a class.
        </p>
      ) : (
        <form noValidate className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={event => {
          event.preventDefault();
          setAttempted(true);
          if (!programId || requestedClassTitle.trim().length < 2 || requestedCourseOrSubject.trim().length < 2 || desiredTerm.trim().length < 2) return;
          const id = requestId.current ?? crypto.randomUUID();
          requestId.current = id;
          void mutation.run(() => submitTeacherClassRequest({ data: {
              requestId: id,
              programId,
              requestedClassTitle,
              requestedCourseOrSubject,
              desiredTerm,
              schedulePreference,
              notes,
            } }), {
            successMessage: "Class request sent to the registrar.",
            commandErrorMessage: "Unable to submit the class request.",
          }).then(outcome => {
            if (outcome.status === "saved") clearSavedDraft();
          });
        }}>
          <fieldset disabled={busy} className="contents" aria-busy={mutation.pending}>
          <Field className="sm:col-span-2" label="School program" required
            error={attempted&&!programId?"Choose a school Program.":undefined}>
            <Select value={programId} onChange={event => {
              resetRequestId();
              setProgramId(event.target.value);
            }}>
              {options.programs.map(program => <option key={program.id} value={program.id}>{program.name}</option>)}
            </Select>
          </Field>
          <Field label="Proposed class title" required
            error={attempted&&requestedClassTitle.trim().length<2?"Enter a class title with at least 2 characters.":undefined}>
            <Input minLength={2} maxLength={160} value={requestedClassTitle}
              onChange={event => { resetRequestId(); setRequestedClassTitle(event.target.value); }}
              />
          </Field>
          <Field label="Course or subject" required
            error={attempted&&requestedCourseOrSubject.trim().length<2?"Enter a course or subject with at least 2 characters.":undefined}>
            <Input minLength={2} maxLength={120} value={requestedCourseOrSubject}
              onChange={event => { resetRequestId(); setRequestedCourseOrSubject(event.target.value); }}
              placeholder="For example, Biology"
              />
          </Field>
          <Field label="Desired term" required
            error={attempted&&desiredTerm.trim().length<2?"Enter a desired term with at least 2 characters.":undefined}>
            <Input minLength={2} maxLength={100} value={desiredTerm}
              onChange={event => { resetRequestId(); setDesiredTerm(event.target.value); }}
              placeholder="For example, Fall 2026"
              />
          </Field>
          <Field label="Schedule preference">
            <Input maxLength={500} value={schedulePreference}
              onChange={event => { resetRequestId(); setSchedulePreference(event.target.value); }}
              placeholder="Optional"/>
          </Field>
          <Field className="sm:col-span-2" label="Notes for the registrar">
            <Textarea maxLength={1000} value={notes}
              onChange={event => { resetRequestId(); setNotes(event.target.value); }}
              rows={3}/>
          </Field>
          <Button type="submit" disabled={busy}>
            Submit class request
          </Button>
          </fieldset>
        </form>
      )}
      <MutationFeedback state={{ ...mutation, retryRefresh }}
        className="mt-3" pendingMessage="Submitting class request..."/>
      {options.requests.length > 0 && (
        <section className="mt-6 border-t pt-4" aria-labelledby="class-request-history-title">
          <h3 id="class-request-history-title" className="font-semibold">Your class requests</h3>
          <ul className="mt-3 space-y-3">
            {options.requests.map(request => (
              <li key={request.id} className="rounded-lg border p-3 text-sm">
                <p className="font-medium">{request.requestedClassTitle} · {request.programName}</p>
                <p className="mt-1 text-muted-foreground">
                  {request.status === "open" ? "Waiting for registrar review" :
                    request.status === "resolved" ? "Class setup completed" : "Request declined"}
                  {" · "}{request.requestedCourseOrSubject} · {request.desiredTerm}
                </p>
                {request.resolutionNote && <p className="mt-1">{request.resolutionNote}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

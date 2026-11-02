import { useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
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

  function resetRequestId() {
    requestId.current = null;
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
        <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={event => {
          event.preventDefault();
          const id = requestId.current ?? crypto.randomUUID();
          requestId.current = id;
          void mutation.run(async () => {
            await submitTeacherClassRequest({ data: {
              requestId: id,
              programId,
              requestedClassTitle,
              requestedCourseOrSubject,
              desiredTerm,
              schedulePreference,
              notes,
            } });
            requestId.current = null;
            setRequestedClassTitle("");
            setRequestedCourseOrSubject("");
            setDesiredTerm("");
            setSchedulePreference("");
            setNotes("");
          }, {
            successMessage: "Class request sent to the registrar.",
            commandErrorMessage: "Unable to submit the class request.",
          });
        }}>
          <label className="text-sm sm:col-span-2">
            School program
            <select required value={programId} onChange={event => {
              resetRequestId();
              setProgramId(event.target.value);
            }} className="mt-1 block w-full rounded border bg-background p-2">
              {options.programs.map(program => <option key={program.id} value={program.id}>{program.name}</option>)}
            </select>
          </label>
          <label className="text-sm">
            Proposed class title
            <input required minLength={2} maxLength={160} value={requestedClassTitle}
              onChange={event => { resetRequestId(); setRequestedClassTitle(event.target.value); }}
              className="mt-1 block w-full rounded border bg-background p-2"/>
          </label>
          <label className="text-sm">
            Course or subject
            <input required minLength={2} maxLength={120} value={requestedCourseOrSubject}
              onChange={event => { resetRequestId(); setRequestedCourseOrSubject(event.target.value); }}
              placeholder="For example, Biology"
              className="mt-1 block w-full rounded border bg-background p-2"/>
          </label>
          <label className="text-sm">
            Desired term
            <input required minLength={2} maxLength={100} value={desiredTerm}
              onChange={event => { resetRequestId(); setDesiredTerm(event.target.value); }}
              placeholder="For example, Fall 2026"
              className="mt-1 block w-full rounded border bg-background p-2"/>
          </label>
          <label className="text-sm">
            Schedule preference
            <input maxLength={500} value={schedulePreference}
              onChange={event => { resetRequestId(); setSchedulePreference(event.target.value); }}
              placeholder="Optional"
              className="mt-1 block w-full rounded border bg-background p-2"/>
          </label>
          <label className="text-sm sm:col-span-2">
            Notes for the registrar
            <textarea maxLength={1000} value={notes}
              onChange={event => { resetRequestId(); setNotes(event.target.value); }}
              rows={3} className="mt-1 block w-full rounded border bg-background p-2"/>
          </label>
          <button type="submit" disabled={busy || !programId}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">
            Submit class request
          </button>
        </form>
      )}
      {mutation.pending && <p role="status" className="mt-3 text-sm">Submitting class request...</p>}
      {mutation.error && <p role="alert" className="mt-3 text-sm">
        {mutation.refreshFailed ? "The request was submitted, but its latest status could not be loaded. " : "No request was submitted. "}
        {mutation.error}
      </p>}
      {mutation.notice && <p role="status" className="mt-3 text-sm">{mutation.notice}</p>}
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

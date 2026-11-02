import { useState } from "react";
import { addStudioSchedule } from "@/modules/academic-time/school-year-studio.functions";
import { defaultScheduleDayPattern, scheduleDayPattern } from "@/domain/schedule-day-pattern";
import { useMutationFeedback } from "@/lib/mutation-feedback";

/** Uses the school-year studio command; launch does not own a second timetable. */
export function SchoolYearScheduleSetup({ schoolYearId, programId, startsOn, endsOn, timezone, disabled, changed }: {
  schoolYearId: string; programId?: string; startsOn: string; endsOn: string;
  timezone: string; disabled?: boolean; changed: () => Promise<unknown>;
}) {
  const [name, setName] = useState("Standard instructional day");
  const [pattern, setPattern] = useState(defaultScheduleDayPattern);
  const mutation = useMutationFeedback(changed);
  const busy = Boolean(disabled || mutation.pending || mutation.refreshFailed || mutation.notice);
  const valid = scheduleDayPattern.safeParse(pattern).success && name.trim().length >= 2;
  return <section aria-label="Prepare instructional schedule" className="mt-4 rounded-xl border bg-card p-5">
    <h3 className="font-serif text-xl">Prepare your instructional schedule</h3>
    <p className="mt-2 text-sm">Review a recurring instruction block for {startsOn} through {endsOn}. Times use {timezone}. Include home-learning days where appropriate; this is not a record of onsite attendance or staff coverage.</p>
    <form className="mt-3 space-y-3 text-sm" onSubmit={event => {
      event.preventDefault();
      if (!valid || busy) return;
      void mutation.run(() => addStudioSchedule({ data: {
        schoolYearId, ...(programId ? { programId } : {}), name: name.trim(),
        effectiveFrom: startsOn, effectiveThrough: endsOn, pattern,
      } }), {
        successMessage: "Instructional schedule saved. Review it with the course and instructor below.",
        commandErrorMessage: "Unable to save the instructional schedule.",
        refreshErrorMessage: "The schedule was saved, but updated choices could not be loaded. Refresh saved choices before continuing.",
      });
    }}>
      <fieldset disabled={busy} className="space-y-3">
        <label className="block">Schedule name<input required minLength={2} maxLength={100} value={name} onChange={event => setName(event.target.value)} className="ml-2 rounded border bg-background p-2"/></label>
        <fieldset><legend>Instructional weekdays</legend><div className="mt-2 flex flex-wrap gap-3">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, index) => <label key={day} className="flex items-center gap-1">
            <input type="checkbox" checked={pattern.weekdays.includes(index)} onChange={event => setPattern(current => ({ ...current,
              weekdays: event.target.checked ? [...current.weekdays, index].sort() : current.weekdays.filter(value => value !== index),
            }))}/>{day}
          </label>)}
        </div></fieldset>
        <div className="flex flex-wrap gap-4">
          <label>Instruction starts<input required type="time" value={pattern.startsAtLocal} onChange={event => setPattern(current => ({ ...current, startsAtLocal: event.target.value }))} className="ml-2 rounded border bg-background p-2"/></label>
          <label>Instruction ends<input required type="time" value={pattern.endsAtLocal} onChange={event => setPattern(current => ({ ...current, endsAtLocal: event.target.value }))} className="ml-2 rounded border bg-background p-2"/></label>
        </div>
        {!valid && <p role="status">Choose at least one weekday, a schedule name, and an end time later than the start time.</p>}
        <button type="submit" disabled={!valid || busy} className="rounded bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-50">{mutation.pending ? "Saving schedule…" : "Save reviewed instructional schedule"}</button>
      </fieldset>
    </form>
    <p className="mt-3 text-xs text-muted-foreground">Holidays and closures stay in the academic calendar. Adjust individual periods in school-year settings. Saving this schedule does not activate the year or open the school.</p>
    {mutation.notice && <p role="status" className="mt-3 text-sm">{mutation.notice}</p>}
    {mutation.error && <p role="alert" className="mt-3 text-sm">{mutation.error}</p>}
    {mutation.refreshFailed && <button type="button" disabled={mutation.pending} onClick={() => void mutation.retryRefresh()} className="mt-3 rounded border px-3 py-2 text-sm">Refresh saved schedule choices</button>}
  </section>;
}

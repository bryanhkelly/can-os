import { mutationErrorMessage } from "@/lib/mutation-feedback";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { dateTimeInputValue } from "@/modules/calendar/timezone";
import { unambiguousInstant } from "@/components/operations/launch-orientation-time";
import type { listLaunches } from "@/modules/programs/launch.functions";
type Launch = Awaited<ReturnType<typeof listLaunches>>["launches"][number];

export function LaunchOrientationTask({ launch, busy, save }: {
  launch: Launch;
  busy: boolean;
  save: (input: { title: string; startsAt: string; endsAt: string; timezone: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState("Student and family orientation");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const timezone = launch.siteTimezone ?? "America/Los_Angeles";
  const [timeError, setTimeError] = useState("");
  const [attempted, setAttempted] = useState(false);
  function useRecommendation() {
    try {
      const start = new Date(Date.now() + 7 * 24 * 60 * 60_000);
      const siteDay = dateTimeInputValue(start.toISOString(), timezone).slice(0, 10);
      const suggestedStart = unambiguousInstant(`${siteDay}T18:00`, timezone);
      const end = new Date(Date.parse(suggestedStart) + 45 * 60_000);
      setStartsAt(`${siteDay}T18:00`);
      setEndsAt(dateTimeInputValue(end.toISOString(), timezone));
      setTimeError("");
    } catch (error) {
      setTimeError(mutationErrorMessage(error, "Unable to suggest an orientation time"));
    }
  }
  return <form noValidate className="mt-4 rounded-xl border bg-background p-4" onSubmit={event => {
    event.preventDefault();
    setAttempted(true);
    if (!title.trim() || !startsAt || !endsAt) return;
    try {
      const startIso = unambiguousInstant(startsAt, timezone);
      const endIso = unambiguousInstant(endsAt, timezone);
      if (Date.parse(endIso) <= Date.parse(startIso)) throw new Error("Orientation must end after it starts");
      setTimeError("");
      void save({ title, startsAt: startIso, endsAt: endIso, timezone });
    } catch (error) {
      setTimeError(mutationErrorMessage(error, "Invalid orientation time"));
    }
  }}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm font-semibold">Schedule the canonical orientation event</p>
      <button type="button" onClick={useRecommendation} className="text-sm font-semibold underline">
        Use a suggested 45-minute time
      </button>
    </div>
    <p className="mt-2 text-xs text-muted-foreground">
      The suggestion only fills this form. Saving uses the existing orientation command and the Site timezone ({timezone}).
    </p>
    {timeError && <p role="alert" className="mt-3 text-sm">{timeError}</p>}
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <Field label="Title" className="text-sm sm:col-span-2" required
        error={attempted&&!title.trim()?"Enter an orientation title.":undefined}>
        <Input value={title} onChange={event => setTitle(event.target.value)} />
      </Field>
      <Field label="Start" className="text-sm" required
        error={attempted&&!startsAt?"Choose an orientation start time.":undefined}>
        <Input aria-label="Orientation start" type="datetime-local" value={startsAt}
          onChange={event => setStartsAt(event.target.value)} />
      </Field>
      <Field label="End" className="text-sm" required
        error={attempted&&!endsAt?"Choose an orientation end time.":undefined}>
        <Input aria-label="Orientation end" type="datetime-local" value={endsAt}
          onChange={event => setEndsAt(event.target.value)} />
      </Field>
    </div>
    <Button type="submit" className="mt-4" disabled={busy}>Save orientation</Button>
  </form>;
}

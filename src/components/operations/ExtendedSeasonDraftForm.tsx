import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { programTypeLabels } from "@/domain/program-offerings";
import type { listExtendedSeasonPlanning } from "@/modules/activities/extended-learning.functions";

export type ExtendedSeasonActivityType = "club"|"athletics"|"arts"|"service"|"stem"|"faith"|"leadership"|"outings"|"other";
export type ExtendedSeasonDraftValues = {
  programId: string;
  offeringName: string;
  seasonName: string;
  activityType: ExtendedSeasonActivityType;
  startsOn: string;
  endsOn: string;
  capacity: number;
};
type Program = Awaited<ReturnType<typeof listExtendedSeasonPlanning>>["programs"][number];

/** Controlled draft-only season setup. Saving a draft never opens
 * registration; parent and server retain independent publication gates.
 */
export function ExtendedSeasonDraftForm({
  value, selectable, busy, attempted, onChange, onSubmit,
}: {
  value: ExtendedSeasonDraftValues;
  selectable: readonly Program[];
  busy: boolean;
  attempted: boolean;
  onChange: (patch: Partial<ExtendedSeasonDraftValues>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
}) {
  const {programId, offeringName, seasonName, activityType, startsOn, endsOn, capacity}=value;
  const selected=selectable.some(program=>program.id===programId);
  const draftAttempted=attempted;
  return <form noValidate onSubmit={onSubmit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Extended-learning program" className="text-xs sm:col-span-2" required
          error={draftAttempted&&!selected?"Choose an eligible noncredit program.":undefined}>
          <Select value={programId} onChange={e => onChange({programId:e.target.value})}>
            <option value="">Select a noncredit summer or after-school program</option>
            {selectable.map(p => <option key={p.id} value={p.id}>{p.name} · {programTypeLabels[p.type]}</option>)}
          </Select>
        </Field>
        <Field label="Offering name" className="text-xs" required
          error={draftAttempted&&offeringName.trim().length<2?"Enter an offering name with at least 2 characters.":undefined}>
          <Input value={offeringName} onChange={e => onChange({offeringName:e.target.value})} placeholder="Robotics lab" minLength={2} maxLength={160} />
        </Field>
        <Field label="Season name" className="text-xs" required
          error={draftAttempted&&seasonName.trim().length<2?"Enter a season name with at least 2 characters.":undefined}>
          <Input value={seasonName} onChange={e => onChange({seasonName:e.target.value})} placeholder="Summer 2027 / June" minLength={2} maxLength={120} />
        </Field>
        <Field label="Category" className="text-xs">
          <Select value={activityType} onChange={e => onChange({activityType:e.target.value as ExtendedSeasonActivityType})}>
            <option value="other">Other enrichment</option>
            <option value="stem">STEM / robotics</option>
            <option value="faith">Faith / discipleship</option>
            <option value="leadership">Leadership</option>
            <option value="outings">Outings / field trips</option>
            <option value="club">Club</option>
            <option value="arts">Arts</option>
            <option value="athletics">Athletics</option>
            <option value="service">Service</option>
          </Select>
        </Field>
        <Field label="Seat capacity" className="text-xs" required
          error={draftAttempted&&(!Number.isInteger(capacity)||capacity<1||capacity>10000)?"Enter a whole number from 1 to 10,000.":undefined}>
          <Input type="number" min={1} max={10000} value={capacity} onChange={e => onChange({capacity:Number(e.target.value)})} />
        </Field>
        <Field label="Start date" className="text-xs" required
          error={draftAttempted&&!startsOn?"Choose a start date.":undefined}>
          <Input type="date" value={startsOn} onChange={e => onChange({startsOn:e.target.value})} />
        </Field>
        <Field label="End date" className="text-xs" required
          error={draftAttempted&&(!endsOn||endsOn<startsOn)?"Choose an end date on or after the start date.":undefined}>
          <Input type="date" min={startsOn||undefined} value={endsOn} onChange={e => onChange({endsOn:e.target.value})} />
        </Field>
        <div className="sm:col-span-2">
          <Button variant="outline" type="submit" disabled={busy} className=" border px-4 py-2 text-sm font-semibold disabled:opacity-50">
            {busy ? "Saving…" : "Save draft season"}
          </Button>
          {!selectable.length && <p className="mt-2 text-xs text-muted-foreground">Create a hosted noncredit summer or after-school Program above first.</p>}
        </div>
      </form>;
}

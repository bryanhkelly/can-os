import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ActionFooter } from "@/components/workspace/action-footer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Radio } from "@/components/ui/choice";

export type ClassScheduleMode = "weekly" | "single" | "custom";
export type ClassScheduleRow = {
  id: string;
  localStart: string;
  minutes: number;
};

/** Controlled session-scheduling UI shared by authorized Class operators.
 * The parent creates immutable request IDs, validates local wall-clock
 * times, owns the server command and separately refreshes the Class record.
 */
export function NativeClassScheduleForm({
  classId, siteTimeZone, mode, first, minutes, customRows, busy, scheduled,
  onModeChange, onFirstChange, onMinutesChange, onRowChange,
  onRemoveRow, onAddRow, onSubmit,
}: {
  classId: string;
  siteTimeZone: string;
  mode: ClassScheduleMode;
  first: string;
  minutes: number;
  customRows: readonly ClassScheduleRow[];
  busy: boolean;
  scheduled: boolean;
  onModeChange: (mode: ClassScheduleMode) => void;
  onFirstChange: (value: string) => void;
  onMinutesChange: (value: number) => void;
  onRowChange: (id: string, patch: Partial<Pick<ClassScheduleRow, "localStart" | "minutes">>) => void;
  onRemoveRow: (id: string) => void;
  onAddRow: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<unknown>;
}) {
  return <form onSubmit={event=>void onSubmit(event)}
      className="mt-6 space-y-4 border-t border-border pt-5">
      <h3 className="text-base font-semibold">Schedule Class Sessions</h3>
      <p className="text-sm text-muted-foreground">
        Enter times in the hosting Site's time zone:
        <strong> {siteTimeZone}</strong>. Meetings retain local wall-clock time
        across daylight-saving changes. Ambiguous or missing times are rejected.
      </p>
      <fieldset className="flex flex-wrap gap-3">
        <legend className="mb-2 text-sm font-semibold">Schedule type</legend>
        {([
          ["weekly","Four weekly Sessions"],
          ["single","One Session"],
          ["custom","Custom dates (up to 12)"],
        ] as const).map(([value,label])=><Label key={value}
          className="flex min-h-11 items-center gap-2 border border-border px-3 text-sm">
          <Radio name={"native-schedule-"+classId}
            checked={mode===value} onChange={()=>onModeChange(value)}/>
          {label}
        </Label>)}
      </fieldset>
      {mode!=="custom"?<div className="grid gap-3 sm:grid-cols-2">
        <Field label={`${mode==="weekly"?"First Session":"Session"} start (${siteTimeZone})`} required>
          <Input id="native-series-start" type="datetime-local" required value={first}
            onChange={e=>onFirstChange(e.target.value)}/>
        </Field>
        <Field label="Duration (minutes)" required>
          <Input id="native-series-duration" type="number" required min={15} max={480}
            value={minutes} onChange={e=>onMinutesChange(Number(e.target.value))}/>
        </Field>
      </div>:<div className="space-y-3">
        {customRows.map((row,index)=><div key={row.id}
          className="grid items-end gap-3 border border-border p-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
          <Field label={`Session ${index+1} start (${siteTimeZone})`} required>
            <Input id={"class-custom-"+row.id} type="datetime-local" required
              value={row.localStart} onChange={e=>onRowChange(row.id,{localStart:e.target.value})}
             />
          </Field>
          <Field label="Minutes" required>
            <Input id={"class-minutes-"+row.id} type="number" min={15} max={480} required
              value={row.minutes} onChange={e=>onRowChange(row.id,{minutes:Number(e.target.value)})}
             />
          </Field>
          <Button size="sm" variant="outline" type="button" disabled={customRows.length<=1||busy}
            onClick={()=>onRemoveRow(row.id)}>
            Remove
          </Button>
        </div>)}
        <Button type="button" variant="outline" disabled={busy||customRows.length>=12}
          onClick={onAddRow}>
          Add another Session
        </Button>
      </div>}
      <ActionFooter layout="inline" className="mt-0">
        <Button type="submit" disabled={scheduled||busy||
          (mode!=="custom"&&!first)||(mode==="custom"&&customRows.some(row=>!row.localStart))}
          loading={busy} loadingLabel="Scheduling sessions...">
          {scheduled?"Sessions scheduled":"Schedule "+(mode==="weekly"?"four Sessions":mode==="single"?"one Session":"custom Sessions")}
        </Button>
      </ActionFooter>
      {scheduled&&<p role="status" className="text-sm">
        Saved. Change the date, duration or schedule type to create another booking.
      </p>}
    </form>;
}

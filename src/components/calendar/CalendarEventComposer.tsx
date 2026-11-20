import type { ComponentProps, RefObject } from "react";
import { X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { CalendarInviteesPicker } from "./CalendarInviteesPicker";
import type { useMutationFeedback } from "@/lib/mutation-feedback";

export type CalendarComposerFields = {
  title: string;
  description: string;
  date: string;
  start: string;
  end: string;
  timezone: string;
};

/** Controlled event composer. The caller owns source-authorized address lists,
 * deduplicated invite caps, event submission, and server-side validation.
 */
export function CalendarEventComposer({
  open,busy,attempted,error,mutation,form,initialFocus,invitees,
  selectedInviteeCount,inviteGroupCount,onClose,onSubmit,onFieldChange,
}: {
  open: boolean;
  busy: boolean;
  attempted: boolean;
  error: string;
  mutation: ReturnType<typeof useMutationFeedback>;
  form: CalendarComposerFields;
  initialFocus: RefObject<HTMLInputElement | null>;
  invitees: ComponentProps<typeof CalendarInviteesPicker>;
  selectedInviteeCount: number;
  inviteGroupCount: number;
  onClose: () => void;
  onSubmit: () => void;
  onFieldChange: (field: Exclude<keyof CalendarComposerFields,"timezone">,value:string)=>void;
}) {
  return <Modal open={open} onClose={() => { if (!busy) onClose(); }}
          label="Create calendar event" labelledBy="calendar-event-dialog-title" initialFocus={initialFocus}
          className="max-w-4xl" busy={busy} dismissible={!busy}>
          <form noValidate onSubmit={event => { event.preventDefault(); onSubmit(); }}>
            <header className="flex items-start justify-between gap-5 border-b border-border px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Calendar</p>
                <h2 id="calendar-event-dialog-title" className="mt-1 font-serif text-2xl">Create event</h2>
                <p className="mt-1 text-sm text-muted-foreground">Add an event and invite people from your authorized address list.</p>
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label="Close event composer"
                disabled={busy} onClick={onClose}><X aria-hidden="true" /></Button>
            </header>
            <div className="grid gap-6 p-6 md:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
              <div className="space-y-4">
                <Field label="Title" required error={attempted && form.title.trim().length < 3 ? "Enter a title with at least 3 characters." : undefined}>
                  <Input ref={initialFocus} value={form.title} onChange={event => onFieldChange("title",event.target.value)}
                    minLength={3} maxLength={200} placeholder="Add a title" />
                </Field>
                <Field label="Description">
                  <Textarea value={form.description} onChange={event => onFieldChange("description",event.target.value)}
                    maxLength={2000} rows={4} placeholder="Add details" />
                </Field>
                <Field label="Date" required error={attempted && !form.date ? "Choose an event date." : undefined}>
                  <Input type="date" value={form.date} onChange={event => onFieldChange("date",event.target.value)} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Starts" required error={attempted && !form.start ? "Choose a start time." : undefined}>
                    <Input type="time" value={form.start} onChange={event => onFieldChange("start",event.target.value)} />
                  </Field>
                  <Field label="Ends" error={attempted && form.end && form.end <= form.start ? "Choose an end after the start." : undefined}>
                    <Input type="time" value={form.end} onChange={event => onFieldChange("end",event.target.value)} />
                  </Field>
                </div>
                <p className="text-xs text-muted-foreground">Times use {form.timezone}.</p>
              </div>
              <CalendarInviteesPicker {...invitees} />
            </div>
            {error && <p role="alert" className="mx-6 mb-4 border border-danger/50 bg-danger/10 p-3 text-sm">{error}</p>}
            <MutationFeedback state={mutation} className="px-6 pb-4" pendingMessage="Creating event and sending invitations…" />
            <footer className="flex flex-wrap justify-end gap-3 border-t border-border px-6 py-4">
              <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
              <Button type="submit" size="lg" disabled={busy || selectedInviteeCount > 100 || inviteGroupCount > 50} className="min-w-40">
                {busy ? "Creating…" : "Create event"}
              </Button>
            </footer>
          </form>
        </Modal>;
}

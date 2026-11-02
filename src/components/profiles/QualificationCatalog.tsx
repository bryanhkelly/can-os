import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { createQualificationCatalogEntry } from "@/modules/profiles/qualification-catalog.functions";

export function QualificationCatalog({ programId, canAuthor, changed }: {
  programId: string; canAuthor: boolean; changed: () => Promise<void>;
}) {
  const mutation = useMutationFeedback(changed);
  const busy = mutation.pending || mutation.refreshFailed;
  const [key, setKey] = useState(""), [title, setTitle] = useState(""), [kind, setKind] = useState("");
  const [reason, setReason] = useState(""), [confirmed, setConfirmed] = useState(false);
  async function save() {
    await mutation.run(
      () => createQualificationCatalogEntry({ data: { programId, key, title, kind, reason, confirmed: true } }),
      {
        successMessage: result => result.created
          ? "Shared qualification definition added. Select it in the program policy when appropriate."
          : "An identical definition already exists. No catalog entry or requirement was changed.",
        commandErrorMessage: "Unable to create qualification catalog entry.",
      },
    );
  }
  return <section className="mt-7 rounded-xl border bg-card p-5">
    <h2 className="font-serif text-2xl">Shared qualification catalog</h2>
    <p className="mt-2 text-sm">Reuse an existing definition before adding one. Definitions describe qualifications;
      program policies decide which are required. Creating a definition does not approve evidence or authorize teaching.</p>
    {!canAuthor ? <p className="mt-3 text-sm text-muted-foreground">
      Adding definitions requires an explicit qualification-catalog steward grant in this institution.
      Registrar or policy-publisher status alone is not sufficient.
    </p> : <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); void save(); }}>
      <Field label="Stable qualification key" required><Input disabled={busy} value={key} minLength={3} maxLength={100}
        pattern="[a-z][a-z0-9]*([._-][a-z0-9]+)*" placeholder="teaching-license"
        onChange={event => setKey(event.target.value)} /></Field>
      <Field label="Display title" required><Input disabled={busy} value={title} minLength={3} maxLength={200}
        onChange={event => setTitle(event.target.value)} /></Field>
      <Field label="Classification key" required><Input disabled={busy} value={kind} minLength={2} maxLength={64}
        pattern="[a-z][a-z0-9]*([._-][a-z0-9]+)*" placeholder="license"
        onChange={event => setKind(event.target.value)} /></Field>
      <Field label="Reason for shared catalog addition" required className="sm:col-span-2"><Textarea disabled={busy} value={reason} minLength={10} maxLength={2000}
        onChange={event => setReason(event.target.value)} /></Field>
      <p className="text-xs text-muted-foreground sm:col-span-2">
        The stable key, classification and title are shared across institutions and cannot be edited here.
        This form creates a basic evidence-backed definition, not a specialized attribute schema.
        Do not include private teacher or student details.
      </p>
      <Label className="flex gap-2 leading-6 sm:col-span-2"><Checkbox disabled={busy} checked={confirmed}
        onChange={event => setConfirmed(event.target.checked)} />
        I checked existing entries and confirm this shared definition. Existing claims and published requirements will not change.
      </Label>
      <Button type="submit" variant="outline" disabled={busy || !confirmed || !key.trim() || !title.trim() || !kind.trim() || reason.trim().length < 10}
        className="justify-self-start">
        {busy ? "Saving definition..." : "Add shared definition"}
      </Button>
    </form>}
    <MutationFeedback state={mutation} className="mt-3" pendingMessage="Saving qualification definition..."/>
  </section>;
}
import { MutationFeedback } from "@/components/workspace/mutation-feedback";

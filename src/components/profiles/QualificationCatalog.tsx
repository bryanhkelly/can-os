import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
  const [attempted, setAttempted] = useState(false);
  async function save() {
    setAttempted(true);
    if (key.trim().length < 3 || !/^[a-z][a-z0-9]*([._-][a-z0-9]+)*$/.test(key.trim()) ||
      title.trim().length < 3 || kind.trim().length < 2 || !/^[a-z][a-z0-9]*([._-][a-z0-9]+)*$/.test(kind.trim()) ||
      reason.trim().length < 10 || !confirmed) return;
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
    </p> : <form noValidate className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); void save(); }}>
      <Field label="Stable qualification key" required
        error={attempted&&key.trim().length<3?"Enter at least 3 characters.":attempted&&!/^[a-z][a-z0-9]*([._-][a-z0-9]+)*$/.test(key.trim())?"Use lowercase letters, digits, dots, underscores or hyphens; start with a letter.":undefined}>
        <Input disabled={busy} value={key} minLength={3} maxLength={100}
        pattern="[a-z][a-z0-9]*([._-][a-z0-9]+)*" placeholder="teaching-license"
        onChange={event => setKey(event.target.value)} /></Field>
      <Field label="Display title" required error={attempted&&title.trim().length<3?"Enter a title with at least 3 characters.":undefined}><Input disabled={busy} value={title} minLength={3} maxLength={200}
        onChange={event => setTitle(event.target.value)} /></Field>
      <Field label="Classification key" required
        error={attempted&&kind.trim().length<2?"Enter at least 2 characters.":attempted&&!/^[a-z][a-z0-9]*([._-][a-z0-9]+)*$/.test(kind.trim())?"Use a lowercase classification key starting with a letter.":undefined}>
        <Input disabled={busy} value={kind} minLength={2} maxLength={64}
        pattern="[a-z][a-z0-9]*([._-][a-z0-9]+)*" placeholder="license"
        onChange={event => setKind(event.target.value)} /></Field>
      <Field label="Reason for shared catalog addition" required className="sm:col-span-2"
        error={attempted&&reason.trim().length<10?"Enter at least 10 characters explaining this shared addition.":undefined}><Textarea disabled={busy} value={reason} minLength={10} maxLength={2000}
        onChange={event => setReason(event.target.value)} /></Field>
      <p className="text-xs text-muted-foreground sm:col-span-2">
        The stable key, classification and title are shared across institutions and cannot be edited here.
        This form creates a basic evidence-backed definition, not a specialized attribute schema.
        Do not include private teacher or student details.
      </p>
      <Field className="sm:col-span-2" label="I checked existing entries and confirm this shared definition. Existing claims and published requirements will not change."
        required error={attempted&&!confirmed?"Confirm that you checked for an existing definition.":undefined}>
        <Checkbox disabled={busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
      </Field>
      <Button type="submit" variant="outline" disabled={busy}
        className="justify-self-start">
        {busy ? "Saving definition..." : "Add shared definition"}
      </Button>
    </form>}
    <MutationFeedback state={mutation} className="mt-3" pendingMessage="Saving qualification definition..."/>
  </section>;
}
import { MutationFeedback } from "@/components/workspace/mutation-feedback";

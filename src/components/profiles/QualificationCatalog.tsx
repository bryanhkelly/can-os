import { useState } from "react";
import { createQualificationCatalogEntry } from "@/modules/profiles/qualification-catalog.functions";

export function QualificationCatalog({ programId, canAuthor, changed }: {
  programId: string; canAuthor: boolean; changed: () => Promise<void>;
}) {
  const [key, setKey] = useState(""), [title, setTitle] = useState(""), [kind, setKind] = useState("");
  const [reason, setReason] = useState(""), [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  async function save() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await createQualificationCatalogEntry({ data: { programId, key, title, kind, reason, confirmed: true } });
      await changed();
      setNotice(result.created ? "Shared qualification definition added. Select it in the program policy when appropriate." :
        "An identical definition already exists. No catalog entry or requirement was changed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create qualification catalog entry.");
    } finally { setBusy(false); }
  }
  return <section className="mt-7 rounded-xl border bg-card p-5">
    <h2 className="font-serif text-2xl">Shared qualification catalog</h2>
    <p className="mt-2 text-sm">Reuse an existing definition before adding one. Definitions describe qualifications;
      program policies decide which are required. Creating a definition does not approve evidence or authorize teaching.</p>
    {!canAuthor ? <p className="mt-3 text-sm text-muted-foreground">
      Adding definitions requires an explicit qualification-catalog steward grant in this institution.
      Registrar or policy-publisher status alone is not sufficient.
    </p> : <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); void save(); }}>
      <label className="text-sm">Stable qualification key<input required value={key} minLength={3} maxLength={100}
        pattern="[a-z][a-z0-9]*([._-][a-z0-9]+)*" placeholder="teaching-license"
        onChange={event => setKey(event.target.value)} className="mt-1 block w-full rounded border bg-background p-2" /></label>
      <label className="text-sm">Display title<input required value={title} minLength={3} maxLength={200}
        onChange={event => setTitle(event.target.value)} className="mt-1 block w-full rounded border bg-background p-2" /></label>
      <label className="text-sm">Classification key<input required value={kind} minLength={2} maxLength={64}
        pattern="[a-z][a-z0-9]*([._-][a-z0-9]+)*" placeholder="license"
        onChange={event => setKind(event.target.value)} className="mt-1 block w-full rounded border bg-background p-2" /></label>
      <label className="text-sm sm:col-span-2">Reason for shared catalog addition<textarea required value={reason} minLength={10} maxLength={2000}
        onChange={event => setReason(event.target.value)} className="mt-1 block w-full rounded border bg-background p-2" /></label>
      <p className="text-xs text-muted-foreground sm:col-span-2">
        The stable key, classification and title are shared across institutions and cannot be edited here.
        This form creates a basic evidence-backed definition, not a specialized attribute schema.
        Do not include private teacher or student details.
      </p>
      <label className="flex gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={confirmed}
        onChange={event => setConfirmed(event.target.checked)} />
        I checked existing entries and confirm this shared definition. Existing claims and published requirements will not change.
      </label>
      <button type="submit" disabled={busy || !confirmed || !key.trim() || !title.trim() || !kind.trim() || reason.trim().length < 10}
        className="justify-self-start rounded border px-3 py-2 text-sm disabled:opacity-50">
        {busy ? "Saving definition..." : "Add shared definition"}
      </button>
    </form>}
    {error && <p role="alert" className="mt-3 text-sm">{error}</p>}
    {notice && <p role="status" className="mt-3 text-sm">{notice}</p>}
  </section>;
}

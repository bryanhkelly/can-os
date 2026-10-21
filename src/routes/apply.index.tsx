import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useWorkspaceSession } from "@/components/shell/WorkspaceSession";
import { WorkspaceShell } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { isDemoAccountEmail } from "@/domain/local-demo-access";
import { applicationPacketProgress, packetSections, type FamilyApplicationDetails } from "@/domain/application-packet";
import { ApplicationPacketEditor } from "@/components/enrollment/ApplicationPacketEditor";
import { ApplicationPacketReview } from "@/components/enrollment/ApplicationPacketReview";
import { joinApplicationSchool, listApplicationPrograms, listMyApplications, saveFamilyApplication, submitFamilyApplication } from "@/modules/enrollment/family-application.functions";

export const Route = createFileRoute("/apply/")({
  validateSearch: (search: Record<string, unknown>): { program?: string } => ({
    program: typeof search.program === "string" ? search.program : undefined,
  }),
  loader: safeLoader(() => listApplicationPrograms()),
  component: ApplicationPage,
});
type Application = Awaited<ReturnType<typeof listMyApplications>>[number];
function ApplicationPage() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) return <LoaderFailure title="Apply to a school" outcome={outcome}/>;
  return <Applications programs={outcome.data}/>;
}
function Applications({ programs }: { programs: Awaited<ReturnType<typeof listApplicationPrograms>> }) {
  const { program } = Route.useSearch();
  const { session } = useWorkspaceSession();
  const [programId, setProgramId] = useState(program ??
    (session?.authenticated ? programs.find(item => session.activeContext.programIds.includes(item.id))?.id : undefined) ??
    programs[0]?.id ?? "");
  const [email, setEmail] = useState(""), [firstName, setFirstName] = useState(""), [lastName, setLastName] = useState("");
  const [code, setCode] = useState("");
  const [records, setRecords] = useState<Application[]>([]);
  const [editing, setEditing] = useState<Application | null>(null);
  const [editorStarted, setEditorStarted] = useState(false);
  const [packetDirty, setPacketDirty] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const editorHeading = useRef<HTMLElement>(null);
  const [editorRequest, setEditorRequest] = useState(0);
  const family = session?.authenticated && ["applicant", "guardian"].includes(session.role);
  const permitted = session?.authenticated ? session.activeContext.programIds : [];
  const selected = programs.find(item => item.id === programId);
  const existingProgram = records.find(row => row.id === editing?.id);
  async function refresh() { setRecords(await listMyApplications()); }
  useEffect(() => {
    if (!editorRequest) return;
    editorHeading.current?.scrollIntoView({ block: "start" });
    editorHeading.current?.focus({ preventScroll: true });
  }, [editorRequest]);
  useEffect(() => {
    if (!family) { setRecords([]); return; }
    let active = true;
    setLoading(true); setError("");
    listMyApplications().then(rows => { if (active) setRecords(rows); })
      .catch(error => { if (active) setError(error instanceof Error ? error.message : "Unable to load applications"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [family, session?.authenticated ? session.activeGrantId : null]);
  async function perform(action: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : "Unable to save application"); }
    finally { setBusy(false); }
  }
  function edit(row: Application, reveal = false) {
    if (reveal && editing?.id !== row.id && packetDirty &&
      !window.confirm("Discard unsaved changes and open this application?")) return;
    setEditing(row); setProgramId(row.programId);
    setEditorStarted(true);
    if (reveal) { setNotice(""); setEditorRequest(value => value + 1); }
  }
  async function persistDraft(details: FamilyApplicationDetails) {
    const saved = await saveFamilyApplication({ data: { requestId, programId, ...details,
      ...(editing ? { applicationId: editing.id, expectedVersion: editing.version } : {}) } });
    const rows = await listMyApplications(); setRecords(rows);
    const row = rows.find(item => item.id === saved.applicationId);
    if (!row) throw new Error("Application saved but could not be reloaded. Refresh before continuing.");
    return row;
  }
  function reset() {
    setEditing(null); setEditorStarted(false); setPacketDirty(false); setRequestId(crypto.randomUUID());
  }
  return <WorkspaceShell eyebrow="CAN OS · Admissions" title="Apply to a school"
    subtitle="Create your family application, save your progress, and follow the school's admissions review. Application access does not grant access to student records.">
    {error && <p role="alert" className="mt-5 rounded border border-red-500 p-3">{error}</p>}
    {notice && <p role="status" className="mt-5 rounded border p-3">{notice}</p>}
    <section className="mt-6 space-y-4 rounded-xl border p-5">
      <h2 className="font-serif text-2xl">Choose a program</h2>
      <label className="block">School and program<select aria-label="Application program" disabled={busy || Boolean(editing)}
        value={programId} onChange={event => {
          if (packetDirty && !window.confirm("Discard unsaved changes and choose another program?")) return;
          reset(); setProgramId(event.target.value); setNotice("");
        }}
        className="mt-1 block w-full rounded border bg-background p-2">
        <option value="">Choose program</option>
        {programs.map(item => <option key={item.id} value={item.id}>{item.school} — {item.name} (grades {item.gradeRange.min}–{item.gradeRange.max})</option>)}
        {editing && !selected && <option value={editing.programId}>{editing.program} — applications closed</option>}
      </select></label>
      {!programs.length && <p>No programs are currently accepting online applications. Contact the school.</p>}
      {program && !selected && !editing && <p role="alert">The requested program is unavailable or not accepting applications.</p>}
    </section>
    {!family && <section className="mt-6 rounded-xl border p-5">
      <h2 className="font-serif text-2xl">Create applicant access</h2>
      <p className="mt-2 text-sm">Use your own email for a one-time verification link. For Valor School, use a new @valorschool.demo email and code 000000; no email is sent and no real family information should be entered.</p>
      {session?.authenticated && <p className="mt-2 text-sm">You are signed in as {session.role}. Creating demo applicant access below signs you into that family's account.</p>}
      <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); void perform(async () => {
        const response = await fetch("/apply/access", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ programId, firstName, lastName, email, ...(isDemoAccountEmail(email.trim()) ? { code } : {}) }) });
        const result = await response.json() as { error?: string; signedIn?: boolean };
        if (!response.ok) throw new Error(result.error ?? "Unable to create applicant access");
        if (result.signedIn) { window.location.assign("/apply?program=" + encodeURIComponent(programId)); return; }
        setNotice("If this address can receive access, a one-time sign-in link has been requested. Check your email, then return here. Existing accounts keep their normal permissions.");
      }); }}>
        <label>Parent/contact first name<input required maxLength={100} value={firstName} onChange={e => setFirstName(e.target.value)} className="mt-1 block w-full rounded border bg-background p-2"/></label>
        <label>Parent/contact last name<input required maxLength={100} value={lastName} onChange={e => setLastName(e.target.value)} className="mt-1 block w-full rounded border bg-background p-2"/></label>
        <label>Email<input required type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1 block w-full rounded border bg-background p-2"/></label>
        {isDemoAccountEmail(email.trim()) && <label>Demo access code<input required type="password" value={code} onChange={e => setCode(e.target.value)} className="mt-1 block w-full rounded border bg-background p-2"/></label>}
        <button disabled={busy || !selected} className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-50">
          {isDemoAccountEmail(email.trim()) ? "Create demo family access" : "Email verification link"}</button>
      </form>
      <Link to="/access" className="mt-3 inline-block text-sm underline">Already have access? Sign in</Link>
    </section>}
    {session?.authenticated && selected && (!family || !permitted.includes(programId)) && <button type="button" disabled={busy}
        className="mt-6 rounded border px-4 py-2" onClick={() => void perform(async () => {
          const grant = await joinApplicationSchool({ data: { programId } });
          const response = await fetch("/access/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(grant) });
          if (!response.ok) throw new Error("Unable to select applicant school membership");
          window.location.reload();
        })}>Continue application at this school</button>}
    {family && <>
      {!editorStarted && selected && permitted.includes(programId) && <button type="button" className="mt-6 rounded-lg bg-foreground px-4 py-2 text-background"
        onClick={() => { setEditorStarted(true); setEditorRequest(value => value + 1); }}>Start an application</button>}
      {editorStarted && (permitted.includes(programId) || existingProgram) && <section ref={editorHeading} tabIndex={-1} aria-label="Application packet" className="scroll-mt-24">
        <ApplicationPacketEditor key={`${editing?.id ?? requestId}:${programId}`} application={editing} busy={busy}
          open={Boolean(selected)} gradeRange={selected?.gradeRange} onNew={() => { reset(); setEditorStarted(true); }}
          onDirtyChange={setPacketDirty}
          onSave={async details => {
            setBusy(true); setError(""); setNotice("");
            try {
              edit(await persistDraft(details)); setNotice("Draft saved. Review it and submit when ready.");
            } finally { setBusy(false); }
          }}
          onSubmit={async details => {
            setBusy(true); setError(""); setNotice("");
            try {
              let target = editing;
              if (details) target = await persistDraft(details);
              if (!target) throw new Error("Unable to save the application before submitting");
              try {
                await submitFamilyApplication({ data: { applicationId: target.id, expectedVersion: target.version, confirmed: true } });
              } catch (error) {
                if (target !== editing) {
                  edit(target);
                  if (!editing) setError(`Draft saved, but submission failed: ${error instanceof Error ? error.message : "unknown error"}`);
                }
                throw error;
              }
              await refresh(); reset(); setNotice("Application submitted. The school will review it; your student is not enrolled yet.");
            } finally { setBusy(false); }
          }}/>
      </section>}
      <section className="mt-8 space-y-4"><h2 className="font-serif text-2xl">My applications</h2>
        {loading && <p role="status">Loading applications...</p>}
        {!loading && !error && records.length === 0 && <p>No applications yet. Choose a program and save your first draft.</p>}
        {records.map(row => <article key={row.id} className="space-y-2 rounded-xl border p-5">
          <h3 className="text-lg font-semibold">{row.firstName} {row.lastName} — {row.program}</h3>
          <p>Status: {row.draft ? "Draft — not submitted" : row.waitlisted ? "Waitlisted" : row.stage}</p>
          <p className="text-sm">{row.packet?.schoolYear ? `Requested year: ${row.packet.schoolYear} · ` : ""}Entering grade {row.gradeLevel}</p>
          {row.draft && <p className="text-sm">{packetSections.filter(section => !applicationPacketProgress(row.packet, row.statement)[section.key].length).length} of 3 core sections saved and ready</p>}
          {row.submittedAt && <p className="text-sm">Submitted {new Date(row.submittedAt).toLocaleDateString()}</p>}
          {row.draft ? <><p className="text-sm">Your draft is saved but has not been sent to admissions. Continue to review, confirm and submit it.</p>
            <button type="button" disabled={busy} onClick={() => edit(row, true)} className="rounded border px-3 py-2">Continue draft</button></> :
            <p className="text-sm">Your application is with admissions. Contact the school about corrections or requested information.</p>}
          {!row.draft && !row.verified && <p className="text-sm">Guardian relationship verification is pending. Applicant access does not expose academic or enrollment records.</p>}
          {!row.draft && <details className="pt-2"><summary className="cursor-pointer font-semibold">View submitted application packet</summary>
            <div className="mt-4"><ApplicationPacketReview packet={row.packet} statement={row.statement}/></div>
          </details>}
          {row.verified && <p className="text-sm">The school has verified your guardian relationship. Select your guardian membership in the workspace menu, then <Link to="/guardian/admission-offers" className="underline">open offers and enrollment requirements</Link>.</p>}
        </article>)}
      </section>
    </>}
  </WorkspaceShell>;
}

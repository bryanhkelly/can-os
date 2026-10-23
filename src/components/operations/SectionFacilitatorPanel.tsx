import { useCallback, useEffect, useState } from "react";
import {
  getSectionFacilitatorPlanning, updateSectionFacilitator,
} from "@/modules/operations/site-section-facilitators.functions";

type Plan = Awaited<ReturnType<typeof getSectionFacilitatorPlanning>>;

/**
 * Separate local adults can cover separate Sections (or a Section can
 * have backups). The instructional timetable and physical coverage remain
 * independently verified, never inferred from this appointment form.
 */
export function SectionFacilitatorPanel({ programId }: { programId: string }) {
  const [data, setData] = useState<Plan | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [expires, setExpires] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const reload = useCallback(async () => setData(
    await getSectionFacilitatorPlanning({ data: { programId } }), [programId]);
  useEffect(() => { void reload().catch(error => setError(
    error instanceof Error ? error.message : "Cannot load Section staffing"));
  }, [reload]);

  async function change(input: {
    sectionId: string; personId: string; action: "appoint" | "revoke";
    expectedAssignmentId: string | null; validThrough?: string;
  }) {
    setBusy(input.sectionId + ":" + input.personId); setError(""); setNotice("");
    try {
      await updateSectionFacilitator({ data: input });
      await reload();
      setNotice(input.action === "appoint"
        ? "Named Section responsibility recorded. It does not certify staff screening, scheduled coverage, or school opening."
        : "Section appointment revoked. New roster and attendance access requires an effective assignment.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to change staffing assignment.");
    } finally { setBusy(""); }
  }

  return <section className="mt-7 rounded-xl border bg-card p-5" aria-label="Section facilitator assignments">
    <h2 className="font-serif text-2xl">Staff each onsite class</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Assign multiple verified local adults to the Sections they actually support.
      A facilitator does not gain access to other Sections or a full Program roster.
      Each appointment expires within 90 days, and active oversight, staff screening,
      teaching plans, and physical coverage must be checked separately.
    </p>
    {error && <p role="alert" className="mt-3 rounded border p-3 text-sm">{error}</p>}
    {notice && <p role="status" className="mt-3 rounded border p-3 text-sm">{notice}</p>}
    {!data ? <p className="mt-4 text-sm">Loading class staffing…</p> :
      !data.hasConfiguration ? <p role="status" className="mt-4 rounded border p-3 text-sm">
        Appoint your local Site director first to establish a draft school-operations
        configuration. A draft does not authorize student attendance or school opening.
      </p> : <>
        {!data.sections.length && <p className="mt-4 text-sm">
          Create your first Section and instructional calendar before assigning classroom staff.
        </p>}
        {data.sections.map(section => {
          const current = data.appointments.filter(a => a.sectionId === section.id);
          const key = section.id;
          const personId = selected[key] ?? "";
          const through = expires[key] ?? "";
          const existing = current.find(a => a.personId === personId);
          const effective = (a: (typeof current)[number]) =>
            !!a.effectiveFrom && Date.parse(a.effectiveFrom) <= Date.now() &&
            !!a.effectiveThrough && Date.parse(a.effectiveThrough) > Date.now();
          return <div key={key} className="mt-5 rounded-lg border p-4">
            <h3 className="font-semibold">{section.code} · {section.title}</h3>
            <p className="mt-2 text-xs text-muted-foreground">
              Current named classroom support (not verified physical attendance)
            </p>
            <ul className="mt-2 space-y-2">
              {current.filter(effective).map(a =>
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <span>{a.name} · through {new Date(a.effectiveThrough!).toLocaleDateString()}</span>
                  <button type="button" disabled={!!busy}
                    onClick={() => void change({
                      sectionId:section.id, personId:a.personId,
                      action:"revoke", expectedAssignmentId:a.id,
                    })} className="rounded border px-3 py-1 text-xs disabled:opacity-50">
                    Revoke
                  </button>
                </li>)}
              {!current.some(effective) && <li className="text-sm text-muted-foreground">
                No active named facilitators for this Section.
              </li>}
            </ul>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm">Verified local facilitator
                <select value={personId}
                  onChange={e => setSelected(old => ({ ...old, [key]: e.target.value }))}
                  className="mt-1 w-full rounded border bg-background p-2">
                  <option value="">Choose a person</option>
                  {data.staff.map(person =>
                    <option key={person.personId} value={person.personId}>
                      {person.first} {person.last}
                    </option>)}
                </select>
              </label>
              <label className="text-sm">Appointment ends
                <input type="date" value={through}
                  min={new Date().toISOString().slice(0,10)}
                  max={new Date(Date.now()+89*86400_000).toISOString().slice(0,10)}
                  onChange={e => setExpires(old => ({ ...old, [key]: e.target.value }))}
                  className="mt-1 w-full rounded border bg-background p-2"/>
              </label>
            </div>
            <button type="button" disabled={!!busy || !personId || !through}
              onClick={() => void change({
                sectionId:section.id, personId, action:"appoint",
                expectedAssignmentId: existing?.id ?? null,
                validThrough:new Date(through + "T23:59:59Z").toISOString(),
              })}
              className="mt-3 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50">
              {existing ? "Renew Section appointment" : "Add Section facilitator"}
            </button>
          </div>;
        })}
        {!data.staff.length && <p className="mt-4 text-sm">
          No active email-verified facilitators belong to this exact church Site.
          Use your authorized staff invite workflow first.
        </p>}
      </>}
    <p className="mt-4 text-xs text-muted-foreground">
      Site director accountability remains separately appointed. A named Section
      relationship cannot approve CAN academics, create student enrollment,
      certify child safeguarding, or mark staff physically present.
    </p>
  </section>;
}

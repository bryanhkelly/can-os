import { useCallback, useEffect, useState } from "react";
import { changeLocalSiteDelegation, getLocalSiteDelegations } from "@/modules/operations/site-local-delegation.functions";
import { localResponsibilityRoles, type LocalResponsibility } from "@/domain/site-local-delegation-policy";

type Snapshot = Awaited<ReturnType<typeof getLocalSiteDelegations>>;
const assignments = [
  { key: "site_director", title: "Local Site director",
    explanation: "A named Site leader responsible for reviewing onsite attendance snapshots—not custody release, regulatory clearance or academic credits." },
  { key: "room_facilitator", title: "Local room facilitator",
    explanation: "A named adult responsible for a supervised onsite assignment. Scheduled block duty still requires the separate verified staffing plan." },
] as const;

export function LocalSiteDelegationPanel({ programId }: { programId: string }) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [selections, setSelections] = useState<Partial<Record<LocalResponsibility, string>>>({});
  const [expirations, setExpirations] = useState<Partial<Record<LocalResponsibility, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const reload = useCallback(async () => {
    const next = await getLocalSiteDelegations({ data: { programId } });
    setData(next);
  }, [programId]);

  useEffect(() => {
    let active = true;
    void getLocalSiteDelegations({ data: { programId } }).then(next => {
      if (active) setData(next);
    }).catch(error => {
      if (active) setError(error instanceof Error ? error.message : "Unable to read delegations");
    });
    return () => { active = false; };
  }, [programId]);

  async function change(key: LocalResponsibility, action: "appoint" | "revoke") {
    if (!data) return;
    const current = data.responsibilities.find(row => row.key === key);
    const personId = selections[key];
    const through = expirations[key];
    if (action === "appoint" && (!personId || !through)) {
      setError("Choose an existing, verified Site staff member and a delegation end date.");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      await changeLocalSiteDelegation({ data: {
        programId, responsibility: key, action,
        expectedAssignmentId: current?.id ?? null,
        ...(action === "appoint" && personId && through ? {
          personId, validThrough: new Date(through + "T23:59:59Z").toISOString(),
        } : {}),
      } });
      await reload();
      setNotice(action === "appoint"
        ? "Local staff responsibility recorded with an expiry. School opening and safeguarding still require independent verification."
        : "Local responsibility revoked. New affirmative actions must fail the effective assignment check.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update delegation.");
    } finally { setBusy(false); }
  }

  return <section aria-label="Local school responsibilities" className="mt-7 rounded-xl border bg-card p-5">
    <h2 className="font-serif text-2xl">Delegate local Site responsibilities</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      The church retains local leadership. Named, verified Site staff receive
      time-limited responsibilities for this Program only; appointment cannot
      grant access to CAN academic records, official credits, counseling or other churches.
      An approved CAN onsite-supervision service agreement is required where applicable.
    </p>
    {error && <p role="alert" className="mt-3 rounded border p-3 text-sm">{error}</p>}
    {notice && <p role="status" className="mt-3 rounded border p-3 text-sm">{notice}</p>}
    {!data ? <p className="mt-4 text-sm">Loading Site staff assignments…</p> :
      !data.hasConfiguration ? <p role="status" className="mt-4 rounded border p-4 text-sm">
        Configure this Program's school operating model before making named
        local responsibility appointments. No Site authority was granted.
      </p> : <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {assignments.map(item => {
          const current = data.responsibilities.find(row => row.key === item.key);
          const effective = !!current?.effectiveFrom && !!current.effectiveThrough &&
            Date.parse(current.effectiveFrom) <= Date.now() &&
            Date.parse(current.effectiveThrough) > Date.now();
          const candidates = data.candidates.filter(person =>
            person.role === localResponsibilityRoles[item.key]);
          return <div key={item.key} className="rounded-lg border p-4">
            <h3 className="font-semibold">{item.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{item.explanation}</p>
            <p className="mt-3 text-sm" role="status">
              {effective ? "Currently assigned: " : "No active appointment. "}
              {effective && <strong>{current?.personName}</strong>}
              {current?.effectiveThrough && <span className="block text-xs">
                Through {new Date(current.effectiveThrough).toLocaleDateString()}
              </span>}
            </p>
            <label className="mt-4 block text-sm">
              Verified Site staff
              <select value={selections[item.key] ?? ""}
                onChange={e => setSelections(old => ({ ...old, [item.key]: e.target.value }))}
                className="mt-1 w-full rounded border bg-background p-2">
                <option value="">Choose staff member</option>
                {candidates.map(person => <option key={person.personId} value={person.personId}>
                  {person.firstName} {person.lastName}
                </option>)}
              </select>
            </label>
            <label className="mt-3 block text-sm">
              Responsibility expires
              <input type="date" value={expirations[item.key] ?? ""}
                onChange={e => setExpirations(old => ({ ...old, [item.key]: e.target.value }))}
                min={new Date().toISOString().slice(0, 10)}
                max={new Date(Date.now() + 89 * 86400_000).toISOString().slice(0, 10)}
                className="mt-1 w-full rounded border bg-background p-2" />
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" disabled={busy || !selections[item.key] || !expirations[item.key]}
                onClick={() => void change(item.key, "appoint")}
                className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50">
                {effective ? "Replace appointment" : "Appoint"}
              </button>
              <button type="button" disabled={busy || !effective}
                onClick={() => void change(item.key, "revoke")}
                className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">
                Revoke
              </button>
            </div>
            {!candidates.length && <p className="mt-3 text-xs text-muted-foreground">
              No active email-verified staff with this role at this exact Site.
              Use your authorized staff invitation workflow first.
            </p>}
          </div>;
        })}
      </div>}
    <p className="mt-4 text-xs text-muted-foreground">
      Responsibility appointments are planning/accountability records, not proof
      of completed safeguarding, physical attendance, child release, or campus opening.
    </p>
  </section>;
}

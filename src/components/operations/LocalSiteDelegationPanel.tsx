import { useState } from "react";
import { useIsFetching, useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QueryState } from "@/components/workspace";
import { changeLocalSiteDelegation, type LocalSiteDelegationInput } from "@/modules/operations/site-local-delegation.functions";
import {
  localSiteDelegationsQuery, siteStaffingKeys, siteStaffingMutationOptions, refreshSiteStaffing,
} from "@/modules/operations/site-staffing.queries";
import { localResponsibilityRoles, type LocalResponsibility } from "@/domain/site-local-delegation-policy";

const assignments = [
  { key: "site_director", title: "Local Site director",
    explanation: "A named Site leader responsible for reviewing onsite attendance snapshots—not custody release, regulatory clearance or academic credits." },
] as const;

export function LocalSiteDelegationPanel({ programId }: { programId: string }) {
  return <LocalSiteDelegationForm key={programId} programId={programId}/>;
}

function LocalSiteDelegationForm({ programId }: { programId: string }) {
  const client = useQueryClient();
  const query = useQuery(localSiteDelegationsQuery(programId));
  const data = query.data;
  const [selections, setSelections] = useState<Partial<Record<LocalResponsibility, string>>>({});
  const [expirations, setExpirations] = useState<Partial<Record<LocalResponsibility, string>>>({});
  const [validationError, setValidationError] = useState("");
  const mutation = useMutation(siteStaffingMutationOptions(client, programId,
    (input: LocalSiteDelegationInput) =>
      changeLocalSiteDelegation({ data: input })));
  const pending = useIsMutating({ mutationKey: siteStaffingKeys.program(programId) });
  const fetching = useIsFetching({ queryKey: siteStaffingKeys.program(programId) });
  const busy = pending > 0 || fetching > 0;
  function retry() {
    if (client.isMutating({ mutationKey: siteStaffingKeys.program(programId) })) return;
    mutation.reset();
    void refreshSiteStaffing(client, programId).catch(() => {
      // Each failed read remains an error in QueryState and can be retried again.
    });
  }
  const error = validationError || (mutation.isError
    ? mutation.error instanceof Error ? mutation.error.message : "Unable to update delegation."
    : "");
  const notice = mutation.data ? mutation.variables?.action === "appoint"
    ? "Local staff responsibility recorded with an expiry. School opening and safeguarding still require independent verification."
    : "Local responsibility revoked. New affirmative actions must fail the effective assignment check."
    : "";

  async function change(key: LocalResponsibility, action: "appoint" | "revoke") {
    if (!data || query.isError ||
        client.isFetching({ queryKey: siteStaffingKeys.program(programId) }) ||
        client.isMutating({ mutationKey: siteStaffingKeys.program(programId) })) return;
    const current = data.responsibilities.find(row => row.key === key);
    const personId = selections[key];
    const through = expirations[key];
    if (action === "appoint" && (!personId || !through)) {
      setValidationError("Choose an existing, verified Site staff member and a delegation end date.");
      return;
    }
    setValidationError("");
    try {
      await mutation.mutateAsync({
        programId, responsibility: key, action,
        expectedAssignmentId: current?.id ?? null,
        ...(action === "appoint" && personId && through ? {
          personId, validThrough: new Date(through + "T23:59:59Z").toISOString(),
        } : {}),
      });
    } catch {
      // useMutation exposes command errors; successful saves retain refresh warnings.
    }
  }

  return <section aria-label="Local school responsibilities" className="mt-7 rounded-xl border bg-card p-5">
    <h2 className="font-serif text-2xl">Delegate local Site responsibilities</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      The church retains local leadership. Appoint its named Site director here.
      Assign multiple classroom facilitators to their individual Sections below.
      Neither appointment grants CAN academic records, credits, counseling,
      or authority over other churches.
      An approved CAN onsite-supervision service agreement is required where applicable.
    </p>
    {error && <p role="alert" className="mt-3 rounded border p-3 text-sm">{error}</p>}
    {notice && <p role="status" className="mt-3 rounded border p-3 text-sm">{notice}</p>}
    {mutation.data?.refreshWarning && <p role="alert" className="mt-3 rounded border p-3 text-sm">
      {mutation.data.refreshWarning}
      <button type="button" onClick={retry} disabled={busy} className="ml-3 underline disabled:opacity-50">Refresh staffing</button>
    </p>}
    <QueryState loading={query.isPending ? "Loading Site staff assignments…" : undefined}
      error={query.isError ? query.error.message : undefined}
      onRetry={retry} retrying={busy}>
    {data && <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {!data.hasConfiguration && <p role="status" className="rounded border p-4 text-sm lg:col-span-2">
          No local school operating configuration exists yet. The first authorized
          appointment will create a <strong>draft planning configuration</strong>,
          not an approved opening or safeguarding certification.
        </p>}
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
              <select disabled={busy} value={selections[item.key] ?? ""}
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
              <input type="date" disabled={busy} value={expirations[item.key] ?? ""}
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
    </QueryState>
    <p className="mt-4 text-xs text-muted-foreground">
      Responsibility appointments are planning/accountability records, not proof
      of completed safeguarding, physical attendance, child release, or campus opening.
    </p>
  </section>;
}

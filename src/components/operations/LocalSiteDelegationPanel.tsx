import { mutationErrorMessage } from "@/lib/mutation-feedback";
import { useState } from "react";
import { useIsFetching, useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActionFooter, QueryState, WorkspacePanel, WorkspaceNotice, StatusBadge } from "@/components/workspace";
import { SiteStaffingFeedback } from "./SiteStaffingFeedback";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { changeLocalSiteDelegation, type LocalSiteDelegationInput } from "@/modules/operations/site-local-delegation.functions";
import {
  localSiteDelegationsQuery, siteStaffingKeys, siteStaffingMutationOptions, refreshSiteStaffing,
} from "@/modules/operations/site-staffing.queries";
import { localResponsibilityRoles, type LocalResponsibility } from "@/domain/site-local-delegation-policy";
import { AppointmentExpiryField } from "./AppointmentExpiryField";
import { appointmentExpiryToIso } from "./appointment-expiry";

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
  // A successful write with a failed refresh must not be repeated.
  const writesBlocked = busy || Boolean(mutation.data?.refreshWarning);
  function retry() {
    if (client.isMutating({ mutationKey: siteStaffingKeys.program(programId) })) return;
    mutation.reset();
    void refreshSiteStaffing(client, programId).catch(() => {
      // Each failed read remains an error in QueryState and can be retried again.
    });
  }
  const error = validationError || (mutation.isError
    ? mutationErrorMessage(mutation.error, "Unable to update delegation.")
    : "");
  const notice = mutation.data ? mutation.variables?.action === "appoint"
    ? "Local staff responsibility recorded with an expiry. School opening and safeguarding still require independent verification."
    : "Local responsibility revoked. New affirmative actions must fail the effective assignment check."
    : "";

  async function change(key: LocalResponsibility, action: "appoint" | "revoke") {
    if (!data || query.isError || mutation.data?.refreshWarning ||
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
          personId, validThrough: appointmentExpiryToIso(through),
        } : {}),
      });
    } catch {
      // useMutation exposes command errors; successful saves retain refresh warnings.
    }
  }

  return <WorkspacePanel title="Delegate local Site responsibilities" className="mt-7">
    <p className="mt-2 text-sm text-muted-foreground">
      The church retains local leadership. Appoint its named Site director here.
      Assign multiple classroom facilitators to their individual Sections below.
      Neither appointment grants CAN academic records, credits, counseling,
      or authority over other churches.
      An approved CAN onsite-supervision service agreement is required where applicable.
    </p>
    <SiteStaffingFeedback error={error} notice={notice}
      refreshWarning={mutation.data?.refreshWarning} onRetry={retry} busy={busy}/>
    <QueryState loading={query.isPending ? "Loading Site staff assignments…" : undefined}
      error={query.isError ? mutationErrorMessage(query.error, "Unable to load Site staff assignments.") : undefined}
      onRetry={retry} retrying={busy}>
    {data && <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {!data.hasConfiguration && <WorkspaceNotice className="lg:col-span-2">
          No local school operating configuration exists yet. The first authorized
          appointment will create a <strong>draft planning configuration</strong>,
          not an approved opening or safeguarding certification.
        </WorkspaceNotice>}
        {assignments.map(item => {
          const current = data.responsibilities.find(row => row.key === item.key);
          const effective = !!current?.effectiveFrom && !!current.effectiveThrough &&
            Date.parse(current.effectiveFrom) <= Date.now() &&
            Date.parse(current.effectiveThrough) > Date.now();
          const candidates = data.candidates.filter(person =>
            person.role === localResponsibilityRoles[item.key]);
          return <WorkspacePanel key={item.key} title={item.title} actions={<StatusBadge tone={effective?"success":"attention"}>{effective?"Appointed":"Not appointed"}</StatusBadge>}>
            <p className="mt-2 text-sm text-muted-foreground">{item.explanation}</p>
            <p className="mt-3 text-sm" role="status">
              {effective ? "Currently assigned: " : "No active appointment. "}
              {effective && <strong>{current?.personName}</strong>}
              {current?.effectiveThrough && <span className="block text-xs">
                Through {new Date(current.effectiveThrough).toLocaleDateString()}
              </span>}
            </p>
            <Field label="Verified Site staff" className="mt-4">
              <Select disabled={writesBlocked} value={selections[item.key] ?? ""}
                onChange={e => setSelections(old => ({ ...old, [item.key]: e.target.value }))}>
                <option value="">Choose staff member</option>
                {candidates.map(person => <option key={person.personId} value={person.personId}>
                  {person.firstName} {person.lastName}
                </option>)}
              </Select>
            </Field>
            <div className="mt-3"><AppointmentExpiryField label="Responsibility expires" disabled={writesBlocked}
              value={expirations[item.key] ?? ""}
              onChange={value => setExpirations(old => ({ ...old, [item.key]: value }))}/></div>
            <ActionFooter layout="inline" className="mt-4">
              <Button type="button" variant="outline" disabled={writesBlocked || !selections[item.key] || !expirations[item.key]}
                onClick={() => void change(item.key, "appoint")}>
                {effective ? "Replace appointment" : "Appoint"}
              </Button>
              <Button type="button" variant="outline" disabled={writesBlocked || !effective}
                onClick={() => void change(item.key, "revoke")}>
                Revoke
              </Button>
            </ActionFooter>
            {!candidates.length && <p className="mt-3 text-xs text-muted-foreground">
              No active email-verified staff with this role at this exact Site.
              Use your authorized staff invitation workflow first.
            </p>}
          </WorkspacePanel>;
        })}
      </div>}
    </QueryState>
    <p className="mt-4 text-xs text-muted-foreground">
      Responsibility appointments are planning/accountability records, not proof
      of completed safeguarding, physical attendance, child release, or campus opening.
    </p>
  </WorkspacePanel>;
}

import { mutationErrorMessage } from "@/lib/mutation-feedback";
import { useState } from "react";
import { useIsFetching, useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QueryState } from "@/components/workspace";
import { SiteStaffingFeedback } from "./SiteStaffingFeedback";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { updateSectionFacilitator, type SectionFacilitatorInput } from "@/modules/operations/site-section-facilitators.functions";
import {
  sectionFacilitatorsQuery, siteStaffingKeys, siteStaffingMutationOptions, refreshSiteStaffing,
} from "@/modules/operations/site-staffing.queries";
import { AppointmentExpiryField } from "./AppointmentExpiryField";
import { appointmentExpiryToIso } from "./appointment-expiry";

/** Local appointments remain separate from verified qualifications and coverage. */
export function SectionFacilitatorPanel({ programId }: { programId: string }) {
  return <SectionFacilitatorForm key={programId} programId={programId}/>;
}

function SectionFacilitatorForm({ programId }: { programId: string }) {
  const client = useQueryClient();
  const query = useQuery(sectionFacilitatorsQuery(programId));
  const data = query.data;
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [expires, setExpires] = useState<Record<string, string>>({});
  const mutation = useMutation(siteStaffingMutationOptions(client, programId,
    (input: SectionFacilitatorInput) =>
      updateSectionFacilitator({ data: input })));
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
  const error = mutation.isError
    ? mutationErrorMessage(mutation.error, "Unable to change staffing assignment.")
    : "";
  const notice = mutation.data ? mutation.variables?.action === "appoint"
    ? "Named Section responsibility recorded. It does not certify staff screening, scheduled coverage, or school opening."
    : "Section appointment revoked. New roster and attendance access requires an effective assignment."
    : "";

  async function change(input: SectionFacilitatorInput) {
    if (!data || query.isError ||
        client.isFetching({ queryKey: siteStaffingKeys.program(programId) }) ||
        client.isMutating({ mutationKey: siteStaffingKeys.program(programId) })) return;
    try {
      await mutation.mutateAsync(input);
    } catch {
      // The mutation state renders the server error without retrying the command.
    }
  }

  return <section className="mt-7 border bg-card p-5" aria-label="Section facilitator assignments">
    <h2 className="font-serif text-2xl">Staff each onsite class</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Assign multiple verified local adults to the Sections they actually support.
      A facilitator does not gain access to other Sections or a full Program roster.
      Each appointment expires within 90 days, and active oversight, staff screening,
      teaching plans, and physical coverage must be checked separately.
    </p>
    <SiteStaffingFeedback error={error} notice={notice}
      refreshWarning={mutation.data?.refreshWarning} onRetry={retry} busy={busy}/>
    <QueryState loading={query.isPending ? "Loading class staffing…" : undefined}
      error={query.isError ? mutationErrorMessage(query.error, "Unable to load class staffing.") : undefined}
      onRetry={retry} retrying={busy}>
    {data && (!data.hasConfiguration ? <p role="status" className="mt-4 border p-3 text-sm">
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
          return <div key={key} className="mt-5 border p-4">
            <h3 className="font-semibold">{section.code} · {section.title}</h3>
            <p className="mt-2 text-xs text-muted-foreground">
              Current named classroom support (not verified physical attendance)
            </p>
            <ul className="mt-2 space-y-2">
              {current.filter(effective).map(a =>
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <span>{a.name} · through {new Date(a.effectiveThrough!).toLocaleDateString()}</span>
                  <Button type="button" variant="outline" size="sm" disabled={busy}
                    onClick={() => void change({
                      sectionId:section.id, personId:a.personId,
                      action:"revoke", expectedAssignmentId:a.id,
                    })}>
                    Revoke
                  </Button>
                </li>)}
              {!current.some(effective) && <li className="text-sm text-muted-foreground">
                No active named facilitators for this Section.
              </li>}
            </ul>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Verified local facilitator">
                <Select disabled={busy} value={personId}
                  onChange={e => setSelected(old => ({ ...old, [key]: e.target.value }))}>
                  <option value="">Choose a person</option>
                  {data.staff.map(person =>
                    <option key={person.personId} value={person.personId}>
                      {person.first} {person.last}
                    </option>)}
                </Select>
              </Field>
              <AppointmentExpiryField label="Appointment ends" disabled={busy} value={through}
                onChange={value => setExpires(old => ({ ...old, [key]: value }))}/>
            </div>
            <Button type="button" variant="outline" disabled={busy || !personId || !through}
              onClick={() => void change({
                sectionId:section.id, personId, action:"appoint",
                expectedAssignmentId: existing?.id ?? null,
                validThrough:appointmentExpiryToIso(through),
              })}
              className="mt-3">
              {existing ? "Renew Section appointment" : "Add Section facilitator"}
            </Button>
          </div>;
        })}
        {!data.staff.length && <p className="mt-4 text-sm">
          No active email-verified facilitators belong to this exact church Site.
          Use your authorized staff invite workflow first.
        </p>}
      </>)}
    </QueryState>
    <p className="mt-4 text-xs text-muted-foreground">
      Site director accountability remains separately appointed. A named Section
      relationship cannot approve CAN academics, create student enrollment,
      certify child safeguarding, or mark staff physically present.
    </p>
  </section>;
}

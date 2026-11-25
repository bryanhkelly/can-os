import { Field } from "@/components/ui/field";
import { WorkspacePanel, FormSection, FormActions, EmptyState } from "@/components/workspace";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardHome } from "@/components/workspace/dashboard-home";
import { DashboardShortcut } from "@/components/workspace/dashboard-layout";
import { Building2, ClipboardList, CalendarDays, MessageCircle } from "lucide-react";
import { CANOperatingAuthorizationDesk } from "@/components/networks/CANOperatingAuthorizationDesk";
import { ChurchApplicationsDesk } from "@/components/networks/ChurchApplicationsDesk";
import { LoaderFailure } from "@/lib/loader-failure";
import { safeLoader } from "@/lib/safe-loader";
import {
  listNetworkAgreementDesk, provisionDenominationHQOfficer, verifyNetworkAgreement,
} from "@/modules/networks/network-steward.functions";

export const loadStewardHome = safeLoader(() => listNetworkAgreementDesk(), {
  authMessage: "This workspace requires an authorized CAN network steward membership.",
});

export function CANPartnerDesk({ outcome }: { outcome: Awaited<ReturnType<typeof loadStewardHome>> }) {
  if (!outcome.ok) return <LoaderFailure eyebrow="CAN" title="Partner contracts" outcome={outcome} />;
  return <StewardPanel data={outcome.data} />;
}

function StewardPanel({ data }: { data: Awaited<ReturnType<typeof listNetworkAgreementDesk>> }) {
  const router = useRouter();
  const [denominationOrganizationId, setOrganization] = useState("");
  const [agreementReference, setReference] = useState("");
  const [evidenceDocumentId, setEvidence] = useState("");
  const [validFrom, setFrom] = useState("");
  const [validThrough, setThrough] = useState("");
  const [officerOrganizationId, setOfficerOrg] = useState("");
  const [authorityDocumentId, setAuthorityDocument] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirst] = useState("");
  const [lastName, setLast] = useState("");
  const mutation = useMutationFeedback(() => router.invalidate());
  const busy = mutation.pending || mutation.refreshFailed;

  const saveAgreement = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    await mutation.run(() => verifyNetworkAgreement({ data: {
        denominationOrganizationId, agreementReference, evidenceDocumentId,
        validFrom: new Date(validFrom).toISOString(), validThrough: new Date(validThrough).toISOString(),
      } }), { successMessage: result => result.created ? "Agreement verification recorded." : "Identical agreement already recorded.",
      commandErrorMessage: "Unable to verify agreement." });
  };

  const provision = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    await mutation.run(() => provisionDenominationHQOfficer({ data: {
        denominationOrganizationId: officerOrganizationId, authorityDocumentId,
        email, firstName, lastName,
      } }), { successMessage: result => result.created
        ? "HQ membership recorded. Send the officer through the ordinary verified-email access flow."
        : "This officer already holds the authorized membership.",
      commandErrorMessage: "Unable to provision HQ officer." });
  };
  return <DashboardHome eyebrow="Church onboarding and partner contracts"
    subtitle="Review new church requests, verify church authority, invite leaders, and manage partner contracts. School opening remains separately authorized."
    shortcuts={<>
      <DashboardShortcut title="Church applications" description="Review partner requests" icon={<Building2 className="size-5" />}><a href="#steward-applications" /></DashboardShortcut>
      <DashboardShortcut title="Contracts" description={`${data.agreements.length} recorded contracts`} icon={<ClipboardList className="size-5" />}><a href="#steward-contracts" /></DashboardShortcut>
      <DashboardShortcut title="Calendar" description="Your authorized schedule" icon={<CalendarDays className="size-5" />}><Link to="/calendar" /></DashboardShortcut>
      <DashboardShortcut title="Messages" description="Partner conversations" icon={<MessageCircle className="size-5" />}><Link to="/messages" /></DashboardShortcut>
    </>}
    actions={<><a href="#steward-agreement">Record a verified agreement →</a><Link to="/operations/jurisdiction-profiles">Jurisdiction profiles →</Link></>}>
    <div id="steward-applications"><ChurchApplicationsDesk/></div>
    <p className="mt-5 text-sm text-muted-foreground">Denomination agreements and HQ officer appointments below require an already verified Document with the appropriate subject and category. Church applications above do not require anyone to assemble a document UUID manually.</p>
    <MutationFeedback state={mutation} className="mt-4" pendingMessage="Recording partner authority..."/>
    <WorkspacePanel id="steward-agreement" title="Record independently verified agreement" className="mt-6">
      <form onSubmit={saveAgreement} className="space-y-4" aria-busy={busy}>
        <FormSection title="Required information">
        <Field label="Denomination" required>
          <Select required value={denominationOrganizationId} onChange={e=>setOrganization(e.target.value)}>
            <option value="">Choose denomination…</option>
            {data.networks.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        </Field>
        <Field label="Contract reference" required>
          <Input required minLength={4} maxLength={100} value={agreementReference} onChange={e=>setReference(e.target.value)} placeholder="External agreement ID"/>
        </Field>
        <Field label="Verified signed-agreement document ID" required className="sm:col-span-2">
          <Input required value={evidenceDocumentId} onChange={e=>setEvidence(e.target.value)} placeholder="UUID"/>
        </Field>
        <Field label="Effective date" required>
          <Input required type="date" value={validFrom} onChange={e=>setFrom(e.target.value)}/>
        </Field>
        <Field label="Valid through (exclusive)" required>
          <Input required type="date" value={validThrough} onChange={e=>setThrough(e.target.value)}/>
        </Field>
        </FormSection>
        <FormActions pending={busy} pendingLabel="Recording…" submitLabel="Record agreement"/>
      </form>
    </WorkspacePanel>
    <WorkspacePanel title="Authorize denomination HQ officer" description="Requires a current verified contract and an independently reviewed officer authorization document whose authorized email matches this officer." className="mt-6">
      <form onSubmit={provision} className="space-y-4" aria-busy={busy}>
        <FormSection title="Required information">
        <Field label="Denomination" required>
          <Select required value={officerOrganizationId} onChange={e=>setOfficerOrg(e.target.value)}>
            <option value="">Choose denomination…</option>
            {data.networks.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        </Field>
        <Field label="Verified HQ authority document ID" required>
          <Input required value={authorityDocumentId} onChange={e=>setAuthorityDocument(e.target.value)} placeholder="UUID"/>
        </Field>
        <Field label="Officer email" required>
          <Input required type="email" value={email} onChange={e=>setEmail(e.target.value)}/>
        </Field>
        <Field label="First name" required>
          <Input required value={firstName} onChange={e=>setFirst(e.target.value)}/>
        </Field>
        <Field label="Last name" required>
          <Input required value={lastName} onChange={e=>setLast(e.target.value)}/>
        </Field>
        </FormSection>
        <FormActions pending={busy} pendingLabel="Recording…" submitLabel="Provision verified HQ officer"/>
      </form>
    </WorkspacePanel>
    <WorkspacePanel id="steward-contracts" title="Recorded contracts" className="mt-6">
      <ul className="mt-3 space-y-2">
        {data.agreements.map(a=><li key={a.id} className=" border p-3 text-sm">
          <strong>{data.networks.find(n=>n.id===a.denominationOrganizationId)?.name ?? "Denomination"}</strong>
          {" · "}{a.agreementReference}
          <p className="text-muted-foreground">{new Date(a.validFrom).toLocaleDateString()} – {new Date(a.validThrough).toLocaleDateString()}{" · "}{a.revokedAt ? "Revoked" : new Date(a.validThrough) <= new Date() ? "Expired" : new Date(a.validFrom) > new Date() ? "Not yet effective" : "Within term (subject to evidence validity)"}</p>
        </li>)}
        {!data.agreements.length && <li><EmptyState title="No agreements recorded."/></li>}
      </ul>
    </WorkspacePanel>
    <CANOperatingAuthorizationDesk/>
  </DashboardHome>;
}

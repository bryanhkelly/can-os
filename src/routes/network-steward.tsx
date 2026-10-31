import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { WorkspaceShell } from "@/components/workspace";
import { CANOperatingAuthorizationDesk } from "@/components/networks/CANOperatingAuthorizationDesk";
import { ChurchApplicationsDesk } from "@/components/networks/ChurchApplicationsDesk";
import { LoaderFailure } from "@/lib/loader-failure";
import { safeLoader } from "@/lib/safe-loader";
import {
  listNetworkAgreementDesk, provisionDenominationHQOfficer, verifyNetworkAgreement,
} from "@/modules/networks/network-steward.functions";

export const Route = createFileRoute("/network-steward")({
  loader: safeLoader(() => listNetworkAgreementDesk(), {
    authMessage: "This workspace requires an authorized CAN network steward membership.",
  }),
  component: CANPartnerDesk,
});

function CANPartnerDesk() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) return <LoaderFailure eyebrow="CAN OS · CAN" title="Partner contracts" outcome={outcome} />;
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
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const saveAgreement = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setNotice(""); setError("");
    try {
      const result = await verifyNetworkAgreement({ data: {
        denominationOrganizationId, agreementReference, evidenceDocumentId,
        validFrom: new Date(validFrom).toISOString(), validThrough: new Date(validThrough).toISOString(),
      } });
      await router.invalidate();
      setNotice(result.created ? "Agreement verification recorded." : "Identical agreement already recorded.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to verify agreement.");
    } finally { setBusy(false); }
  };

  const provision = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setNotice(""); setError("");
    try {
      const result = await provisionDenominationHQOfficer({ data: {
        denominationOrganizationId: officerOrganizationId, authorityDocumentId,
        email, firstName, lastName,
      } });
      await router.invalidate();
      setNotice(result.created
        ? "HQ membership recorded. Send the officer through the ordinary verified-email access flow."
        : "This officer already holds the authorized membership.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to provision HQ officer.");
    } finally { setBusy(false); }
  };
  const field = "mt-1 block w-full rounded-lg border bg-background p-2 text-sm";
  return <WorkspaceShell eyebrow="CAN OS · Network partnerships" title="Church onboarding and partner contracts"
    subtitle="Review new church requests, verify church authority, invite leaders, and manage partner contracts. School opening remains separately authorized.">
    <ChurchApplicationsDesk/>
    <p className="mt-5 text-sm text-muted-foreground">Denomination agreements and HQ officer appointments below require an already verified Document with the appropriate subject and category. Church applications above do not require anyone to assemble a document UUID manually.</p>
    {error && <p role="alert" className="mt-4 rounded-lg border p-3 text-sm">{error}</p>}
    {notice && <p role="status" className="mt-4 rounded-lg border p-3 text-sm">{notice}</p>}
    <section className="mt-6 rounded-xl border bg-card p-5">
      <h2 className="font-serif text-2xl">Record independently verified agreement</h2>
      <form onSubmit={saveAgreement} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Denomination
          <select required className={field} value={denominationOrganizationId} onChange={e=>setOrganization(e.target.value)}>
            <option value="">Choose denomination…</option>
            {data.networks.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Contract reference
          <input required minLength={4} maxLength={100} className={field} value={agreementReference} onChange={e=>setReference(e.target.value)} placeholder="External agreement ID"/>
        </label>
        <label className="text-sm font-medium sm:col-span-2">Verified signed-agreement document ID
          <input required className={field} value={evidenceDocumentId} onChange={e=>setEvidence(e.target.value)} placeholder="UUID"/>
        </label>
        <label className="text-sm font-medium">Effective date
          <input required type="date" className={field} value={validFrom} onChange={e=>setFrom(e.target.value)}/>
        </label>
        <label className="text-sm font-medium">Valid through (exclusive)
          <input required type="date" className={field} value={validThrough} onChange={e=>setThrough(e.target.value)}/>
        </label>
        <button type="submit" disabled={busy} className="rounded-lg bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50 sm:col-span-2">
          {busy ? "Recording…" : "Record agreement"}
        </button>
      </form>
    </section>
    <section className="mt-6 rounded-xl border bg-card p-5">
      <h2 className="font-serif text-2xl">Authorize denomination HQ officer</h2>
      <p className="mt-2 text-sm text-muted-foreground">Requires a current verified contract and an independently reviewed officer authorization document whose authorized email matches this officer.</p>
      <form onSubmit={provision} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Denomination
          <select required className={field} value={officerOrganizationId} onChange={e=>setOfficerOrg(e.target.value)}>
            <option value="">Choose denomination…</option>
            {data.networks.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Verified HQ authority document ID
          <input required className={field} value={authorityDocumentId} onChange={e=>setAuthorityDocument(e.target.value)} placeholder="UUID"/>
        </label>
        <label className="text-sm font-medium">Officer email
          <input required type="email" className={field} value={email} onChange={e=>setEmail(e.target.value)}/>
        </label>
        <label className="text-sm font-medium">First name
          <input required className={field} value={firstName} onChange={e=>setFirst(e.target.value)}/>
        </label>
        <label className="text-sm font-medium">Last name
          <input required className={field} value={lastName} onChange={e=>setLast(e.target.value)}/>
        </label>
        <button type="submit" disabled={busy} className="rounded-lg bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50 sm:col-span-2">
          {busy ? "Recording…" : "Provision verified HQ officer"}
        </button>
      </form>
    </section>
    <section className="mt-6 rounded-xl border bg-card p-5">
      <h2 className="font-serif text-2xl">Recorded contracts</h2>
      <ul className="mt-3 space-y-2">
        {data.agreements.map(a=><li key={a.id} className="rounded-lg border p-3 text-sm">
          <strong>{data.networks.find(n=>n.id===a.denominationOrganizationId)?.name ?? "Denomination"}</strong>
          {" · "}{a.agreementReference}
          <p className="text-muted-foreground">{new Date(a.validFrom).toLocaleDateString()} – {new Date(a.validThrough).toLocaleDateString()}{" · "}{a.revokedAt ? "Revoked" : new Date(a.validThrough) <= new Date() ? "Expired" : new Date(a.validFrom) > new Date() ? "Not yet effective" : "Within term (subject to evidence validity)"}</p>
        </li>)}
        {!data.agreements.length && <li className="text-sm text-muted-foreground">No agreements recorded.</li>}
      </ul>
    </section>
    <CANOperatingAuthorizationDesk/>
  </WorkspaceShell>;
}

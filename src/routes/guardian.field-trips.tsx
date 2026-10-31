import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { WorkspaceShell } from "@/components/workspace";
import {
  listGuardianFieldTripPermissions, signGuardianFieldTripPermission,
  declineGuardianFieldTripPermission,
} from "@/modules/field-trips/guardian-permissions.functions";

export const Route = createFileRoute("/guardian/field-trips")({
  loader: safeLoader(() => listGuardianFieldTripPermissions(), {
    authMessage: "Sign in as an authorized guardian to review trip permissions.",
  }),
  component: GuardianTrips,
});

type Trip = Awaited<ReturnType<typeof listGuardianFieldTripPermissions>>[number];

function GuardianTrips() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) {
    return <LoaderFailure eyebrow="CAN OS · Family" title="Field trip permissions" outcome={outcome} />;
  }
  return <TripPermissions items={outcome.data} />;
}

function TripPermissions({ items }: { items: Trip[] }) {
  const router = useRouter();
  const [acknowledged, setAcknowledged] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  async function sign(participantId: string) {
    setBusy(participantId); setNotice(""); setError("");
    try {
      await signGuardianFieldTripPermission({
        data: { participantId, acknowledged: true },
      });
      setNotice("Your field trip permission was recorded.");
      try { await router.invalidate(); }
      catch { setError("Your signature was saved, but the invitation list could not refresh. Reopen this page instead of signing again."); }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign permission.");
    } finally {
      setBusy("");
    }
  }
  async function decline(participantId:string,studentName:string){
    if(busy)return;
    if(!window.confirm("Decline or withdraw field-trip permission for "+studentName+"? The school will be notified and this child cannot board without valid permission. If your child has already boarded, contact the school immediately."))return;
    setBusy(participantId);setNotice("");setError("");
    try{
      const result=await declineGuardianFieldTripPermission({data:{participantId,confirmed:true,note:""}});
      setNotice(result.saved?"Your refusal was recorded and the school was notified.":"Your refusal was already recorded.");
      try{await router.invalidate();}
      catch{setError("Your decision was saved, but this list could not refresh. Reopen it before submitting again.");}
    }catch(err){setError(err instanceof Error?err.message:"Unable to decline trip participation.");}
    finally{setBusy("");}
  }
  const money = (cents: number) => new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
  }).format(cents / 100);
  return (
    <WorkspaceShell
      eyebrow="CAN OS · Family"
      title="Field trip permissions"
      subtitle="Review published school permission language and respond to invitations for your children. Permission and fees are separate steps."
      actions={<Link to="/guardian" className="rounded-lg border px-3 py-2 text-sm">Family home</Link>}
    >
      {notice && <p role="status" className="mt-5 rounded-lg border p-3 text-sm">{notice}</p>}
      {error && <p role="alert" className="mt-5 rounded-lg border border-red-500 p-3 text-sm">{error}</p>}
      <div className="mt-7 space-y-4">
        {items.map(item => <article key={item.participantId} className="rounded-xl border bg-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.studentName}</p>
          <h2 className="mt-2 text-xl font-semibold">{item.title}</h2>
          <p className="mt-2 text-sm">{item.destination}</p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-muted-foreground">Departure</dt>
              <dd>{new Date(item.departsAt).toLocaleString()}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Return</dt>
              <dd>{new Date(item.returnsAt).toLocaleString()}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Permission deadline</dt>
              <dd>{item.deadline ? new Date(item.deadline).toLocaleString() : "Before departure"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Fee</dt>
              <dd>{item.feeAmountCents ? money(item.feeAmountCents) : "No fee"}</dd></div>
          </dl>
          {item.status === "permission_complete"
            ? <div className="mt-4 space-y-3 rounded-lg border p-3 text-sm">
                <p>Permission recorded.</p>
                {item.canDecline&&<button type="button" disabled={!!busy}
                  className="rounded border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                  onClick={()=>void decline(item.participantId,item.studentName)}>Withdraw permission before boarding</button>}
                {!item.canDecline&&<p className="text-xs text-muted-foreground">Contact the school immediately if your plans change.</p>}
              </div>
            : item.status === "declined"
              ? <p className="mt-4 rounded-lg border p-3 text-sm">Permission declined. The school was notified; this child is not authorized to board.</p>
            : item.permissionText
              ? <div className="mt-5">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    School permission statement · Version {item.permissionVersion}
                  </p>
                  <div className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 text-sm">
                    {item.permissionText}
                  </div>
                  {!item.canSign
                    ? <p className="mt-3 text-sm text-amber-700">The permission window is closed. Contact your school.</p>
                    : <>
                        <label className="mt-4 flex items-start gap-3 text-sm">
                          <input type="checkbox" className="mt-1"
                            checked={acknowledged[item.participantId] ?? false}
                            onChange={event => setAcknowledged(previous => ({
                              ...previous, [item.participantId]: event.target.checked,
                            }))} />
                          <span>I am authorized to provide permission for {item.studentName},
                            and I have read and agree to the school's statement above.</span>
                        </label>
                        <button type="button" disabled={!!busy || !acknowledged[item.participantId]}
                          className="mt-4 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50"
                          onClick={() => void sign(item.participantId)}>Sign permission</button>
                        {item.canDecline&&<button type="button" disabled={!!busy}
                          className="ml-3 mt-4 rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50"
                          onClick={()=>void decline(item.participantId,item.studentName)}>Decline participation</button>}
                      </>}
                </div>
              : <p className="mt-4 text-sm text-amber-700">
                  This school has not published a permission statement for this trip.
                </p>}
          {(item.feeAmountCents ?? 0) > 0 && <p className="mt-3 text-xs text-muted-foreground">
            Signing permission does not pay the trip fee. Payment or financial assistance
            must be handled through the school's existing finance process.
          </p>}
        </article>)}
        {items.length === 0 && <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          No field trip invitations are currently associated with your enrolled children.
        </p>}
      </div>
    </WorkspaceShell>
  );
}

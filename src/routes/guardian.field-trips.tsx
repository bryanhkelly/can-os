import { useState } from "react";
import { FieldTripFacts } from "@/components/field-trips/FieldTripFacts";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { EmptyState, WorkspaceNotice, WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Label } from "@/components/ui/label";
import {
  listGuardianFieldTripPermissions, signGuardianFieldTripPermission,
  declineGuardianFieldTripPermission,
} from "@/modules/field-trips/guardian-permissions.functions";

export const Route = createFileRoute("/guardian/field-trips")({
  validateSearch: (search: Record<string, unknown>): { trip?: string } => ({
    trip: typeof search.trip === "string" ? search.trip : undefined,
  }),
  loader: safeLoader(() => listGuardianFieldTripPermissions(), {
    authMessage: "Sign in as an authorized guardian to review trip permissions.",
  }),
  component: GuardianTrips,
});

type Trip = Awaited<ReturnType<typeof listGuardianFieldTripPermissions>>[number];

function GuardianTrips() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) {
    return <LoaderFailure eyebrow="Family" title="Field trip permissions" outcome={outcome} />;
  }
  return <TripPermissions items={outcome.data} />;
}

function TripPermissions({ items }: { items: Trip[] }) {
  const { trip } = Route.useSearch();
  const visibleItems = trip ? items.filter(item => item.tripId === trip) : items;
  const router = useRouter();
  const mutation = useMutationFeedback(() => router.invalidate());
  const busy = mutation.pending || mutation.refreshFailed;
  const [acknowledged, setAcknowledged] = useState<Record<string, string>>({});
  async function sign(item: Trip) {
    if (!item.permissionVersion || !item.permissionText ||
        acknowledged[item.participantId] !== JSON.stringify([item.permissionVersion, item.permissionText])) return;
    await mutation.run(
      () => signGuardianFieldTripPermission({
        data: { participantId: item.participantId, acknowledged: true,
          permissionVersion: item.permissionVersion!, permissionText: item.permissionText! },
      }),
      {
        successMessage: "Your field trip permission was recorded.",
        commandErrorMessage: "Could not sign permission.",
        refreshErrorMessage: "Your signature was saved, but the invitation list could not refresh. Reopen this page instead of signing again.",
      },
    );
  }
  async function decline(participantId:string,studentName:string){
    if(busy)return;
    if(!window.confirm("Decline or withdraw field-trip permission for "+studentName+"? The school will be notified and this child cannot board without valid permission. If your child has already boarded, contact the school immediately."))return;
    await mutation.run(
      () => declineGuardianFieldTripPermission({data:{participantId,confirmed:true,note:""}}),
      {
        successMessage: result => result.saved
          ? "Your refusal was recorded and the school was notified."
          : "Your refusal was already recorded.",
        commandErrorMessage: "Unable to decline trip participation.",
        refreshErrorMessage: "Your decision was saved, but this list could not refresh. Reopen it before submitting again.",
      },
    );
  }
  return (
    <WorkspaceShell
      eyebrow="Family"
      title="Field trip permissions"
      subtitle="Review published school permission language and respond to invitations for your children. Permission and fees are separate steps."
      actions={<Link to="/home" className=" border px-3 py-2 text-sm">Family home</Link>}
    >
      <MutationFeedback state={mutation} className="mt-5" pendingMessage="Saving permission decision..."/>
      {trip && <Link to="/guardian/field-trips" className="mt-5 inline-block text-sm font-semibold underline">View all field trips</Link>}
      {trip && visibleItems.length === 0 && <WorkspaceNotice tone="danger" className="mt-5">This field trip invitation is no longer available in your authorized family workspace. You can view other trips or contact the school.</WorkspaceNotice>}
      <div className="mt-7 space-y-4">
        {visibleItems.map(item => <article key={item.participantId} className=" border bg-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.studentName}</p>
          <h2 className="mt-2 text-xl font-semibold">{item.title}</h2>
          <p className="mt-2 text-sm">{item.destination}</p>
          <FieldTripFacts trip={item}/>
          {item.status === "permission_complete"
            ? <div className="mt-4 space-y-3  border p-3 text-sm">
                <p>Permission recorded.</p>
                {item.canDecline&&<Button type="button" variant="outline" size="sm" disabled={!!busy}
                  onClick={()=>void decline(item.participantId,item.studentName)}>Withdraw permission before boarding</Button>}
                {!item.canDecline&&<p className="text-xs text-muted-foreground">Contact the school immediately if your plans change.</p>}
              </div>
            : item.status === "declined"
              ? <p className="mt-4  border p-3 text-sm">Permission declined. The school was notified; this child is not authorized to board.</p>
            : item.permissionText
              ? <div className="mt-5">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    School permission statement · Version {item.permissionVersion}
                  </p>
                  <div className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap  border bg-muted/30 p-4 text-sm">
                    {item.permissionText}
                  </div>
                  {!item.canSign
                    ? <p className="mt-3 text-sm text-amber-700">The permission window is closed. Contact your school.</p>
                    : <>
                        <Label className="mt-4 flex items-start gap-3 text-sm">
                          <Checkbox className="mt-1"
                            checked={!!item.permissionVersion && !!item.permissionText &&
                              acknowledged[item.participantId] === JSON.stringify([item.permissionVersion, item.permissionText])}
                            onChange={event => setAcknowledged(previous => ({
                              ...previous, [item.participantId]: event.target.checked
                                ? JSON.stringify([item.permissionVersion, item.permissionText]) : "",
                            }))} />
                          <span>I am authorized to provide permission for {item.studentName},
                            and I have read and agree to the school's statement above.</span>
                        </Label>
                        <Button type="button" disabled={!!busy || !item.permissionVersion || !item.permissionText ||
                            acknowledged[item.participantId] !== JSON.stringify([item.permissionVersion, item.permissionText])}
                          className="mt-4"
                          onClick={() => void sign(item)}>Sign permission</Button>
                        {item.canDecline&&<Button type="button" variant="outline" disabled={!!busy}
                          className="ml-3 mt-4"
                          onClick={()=>void decline(item.participantId,item.studentName)}>Decline participation</Button>}
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
        {!trip && items.length === 0 && <EmptyState title="No field trip invitations" description="No field trip invitations are currently associated with your enrolled children."/>}
      </div>
    </WorkspaceShell>
  );
}
import { MutationFeedback } from "@/components/workspace/mutation-feedback";

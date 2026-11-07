import type { ComponentProps, FormEvent } from "react";
import { LaunchCreatedHandoff, type LaunchCreatedResult } from "@/components/operations/LaunchCreatedHandoff";
import { LaunchSchoolModelPicker } from "@/components/operations/LaunchSchoolModelPicker";
import { LaunchProgramIdentityFields } from "@/components/operations/LaunchProgramIdentityFields";
import { LaunchDeliveryModelFields } from "@/components/operations/LaunchDeliveryModelFields";
import { LaunchHostAndProviderFields } from "@/components/operations/LaunchHostAndProviderFields";
import { Button } from "@/components/ui/button";
import { LaunchFieldHelp } from "@/components/launch-studio/LaunchFieldHelp";
import { launchSiteJurisdictionIssue, siteJurisdictionLocation } from "@/domain/site-jurisdiction-default";
import { siteAddressEditorDraft } from "@/domain/site-setup-configuration";

export function LaunchConfigurationForm({created,hasSchoolPreparation,modelPresets,identity,delivery,hostAndProvider,submitLaunch,busy}:{
  created:LaunchCreatedResult|null;
  hasSchoolPreparation:boolean;
  modelPresets:Omit<ComponentProps<typeof LaunchSchoolModelPicker>,"value">;
  identity:ComponentProps<typeof LaunchProgramIdentityFields>;
  delivery:ComponentProps<typeof LaunchDeliveryModelFields>;
  hostAndProvider:ComponentProps<typeof LaunchHostAndProviderFields>;
  submitLaunch:(event:FormEvent)=>void|Promise<void>;
  busy:boolean;
}) {
  const {options}=hostAndProvider;
  const host=options.organizations.find(item=>item.id===hostAndProvider.hostOrganizationId);
  const site=options.sites.find(item=>item.id===hostAndProvider.siteId);
  const jurisdiction=options.jurisdictions.find(item=>item.id===hostAndProvider.jurisdictionId);
  const provider=options.academicProviderOrganizations.find(item=>item.id===hostAndProvider.academicProviderOrganizationId);
  const creditIssuer=options.creditIssuingOrganizations.find(item=>item.id===hostAndProvider.creditIssuingOrganizationId);
  const savedSite=Boolean(site);
  const jurisdictionIssue=launchSiteJurisdictionIssue(siteJurisdictionLocation(site?.address,site?.planningLocation),options.jurisdictions,hostAndProvider.jurisdictionId);
  const address=siteAddressEditorDraft(site?.address ?? null);
  const physicalLocation=[address.street1,address.city,address.state,address.postalCode].filter(Boolean).join(", ");
  return <>
    <LaunchCreatedHandoff created={created}/>
    <details id="new-school-launch" className="launch-school-form rounded-xl border bg-card p-5" open={!hasSchoolPreparation}>
      <summary className="cursor-pointer"><h2 className="inline font-serif text-2xl">Your school details</h2></summary>
      <p className="mt-2 text-sm text-muted-foreground">
        Confirm where your school meets, then tell us what students will learn.
      </p>
      {hasSchoolPreparation&&<p role="status" className="mt-3 rounded-lg border p-3 text-sm">
        Your existing school is saved above. Use its checklist to continue setup.
        This form adds another school offering; it won't change your existing one.
      </p>}
      <div className="mt-5 space-y-5">
        <section aria-label="School location" className="border-t pt-5">
          <h3 className="mb-4 font-serif text-2xl">1. Where your school meets</h3>
          <LaunchHostAndProviderFields {...hostAndProvider}/>
        </section>
        <section aria-label="School offering" className="border-t pt-5">
          <h3 className="mb-4 font-serif text-2xl">2. What your school offers</h3>
          <LaunchSchoolModelPicker {...modelPresets} value={identity.type}/>
          <form className="mt-6 space-y-6" onSubmit={submitLaunch} aria-busy={busy}>
            <fieldset disabled={busy||Boolean(created)} className="space-y-6">
            <LaunchProgramIdentityFields {...identity}/>
            <LaunchDeliveryModelFields {...delivery}/>
            </fieldset>
            <section aria-label="Review your school details" className="rounded-xl bg-muted/30 p-5">
              <h4 className="font-serif text-2xl">3. A final look</h4>
              <dl className="mt-4 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
                <div><dt>School organization</dt><dd>{host?.name??"Choose an organization"}</dd></div>
                <div><dt>School location</dt><dd>{site?.name ?? "Choose a location"}</dd></div>
                <div><dt>Address</dt><dd>{physicalLocation || "Not added yet"}</dd></div>
                <div><dt>School name &amp; grades</dt><dd>{identity.name.trim() || "Add a name"} · {identity.gradeMin}–{identity.gradeMax}</dd></div>
                <div><dt>State or region</dt><dd>{jurisdiction?.name??"Choose your state or region"}</dd></div>
                <div><dt>Teaching organization</dt><dd>{provider?.name??"Choose an organization"}</dd></div>
                <div><dt>Transcript organization</dt><dd>{hostAndProvider.creditMode==="non_credit"?"No academic credit":creditIssuer?.name??"Choose an organization"}</dd></div>
                <div><dt>Learning format</dt><dd>{[
                  delivery.onsite?"In person":null,delivery.liveOnline?"Live online":null,
                  delivery.asynchronous?"At your own pace":null,
                ].filter(Boolean).join(" + ") || "Select a delivery model"}</dd></div>
              </dl>
              <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                Saving starts your setup. It does not approve your school to open.
                <LaunchFieldHelp label="What saving your school means" align="end">
                  Your calendar, school-opening approval, admissions and public website each need their own review.
                  Choosing a teaching organization does not establish an agreement or give it access to student records.
                </LaunchFieldHelp>
              </div>
            </section>
            {jurisdictionIssue&&<p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">{jurisdictionIssue.message}</p>}
            <Button type="submit" disabled={busy||Boolean(created)||Boolean(jurisdictionIssue)}>
              {busy?"Saving your school…":created?"School saved":"Save and continue"}
            </Button>
            {!savedSite&&delivery.onsite&&<p role="status" className="text-sm text-muted-foreground">
              Choose a school location or save a new one in step 1.
            </p>}
            {!options.organizations.length&&<p className="text-xs text-muted-foreground">
              Your account does not have school setup access. Ask CAN to confirm your school setup invitation.
            </p>}
          </form>
        </section>
      </div>
    </details>
  </>;
}

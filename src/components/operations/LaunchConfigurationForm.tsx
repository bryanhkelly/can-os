import type { ComponentProps, FormEvent } from "react";
import { LaunchCreatedHandoff, type LaunchCreatedResult } from "@/components/operations/LaunchCreatedHandoff";
import { LaunchSchoolModelPicker } from "@/components/operations/LaunchSchoolModelPicker";
import { LaunchProgramIdentityFields } from "@/components/operations/LaunchProgramIdentityFields";
import { LaunchDeliveryModelFields } from "@/components/operations/LaunchDeliveryModelFields";
import { LaunchHostAndProviderFields } from "@/components/operations/LaunchHostAndProviderFields";
import { Button } from "@/components/ui/button";

export function LaunchConfigurationForm({created,hasSchoolPreparation,modelPresets,identity,delivery,hostAndProvider,submitLaunch,busy}:{
  created:LaunchCreatedResult|null;
  hasSchoolPreparation:boolean;
  modelPresets:ComponentProps<typeof LaunchSchoolModelPicker>;
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
  const canSubmit=Boolean(host && jurisdiction && provider &&
    (!delivery.onsite || savedSite) &&
    (hostAndProvider.creditMode==="non_credit" || creditIssuer));
  return <>
    <LaunchCreatedHandoff created={created}/>
    <details id="new-school-launch" className="rounded-xl border bg-card p-5" open={!hasSchoolPreparation}>
      <summary className="cursor-pointer text-lg font-semibold">Set up a school · Save and continue</summary>
      <p className="mt-2 text-sm text-muted-foreground">
        Your church Site and school Program are different saved records. Start by confirming the existing church
        and its physical location. You can return to either record without creating a second school.
      </p>
      {hasSchoolPreparation&&<p role="status" className="mt-3 rounded-lg border p-3 text-sm">
        Your existing school setup is saved in the preparation workspace above. This blank form is for
        creating an additional Program; it does not edit, replace, or erase an existing Program.
        To resume academics, calendars, website or family outreach, use the saved school controls above.
      </p>}
      <div className="mt-5 space-y-5">
        <section aria-label="Step 1 · Church and school location" className="rounded-xl border p-4">
          <h3 className="mb-3 text-base font-semibold">1. Confirm the church and school location</h3>
          <LaunchHostAndProviderFields {...hostAndProvider}/>
        </section>
        <section aria-label="Step 2 · School Program" className="rounded-xl border p-4">
          <h3 className="mb-3 text-base font-semibold">2. Choose the academic model</h3>
          <LaunchSchoolModelPicker {...modelPresets}/>
          <form className="mt-4 space-y-5" onSubmit={submitLaunch}>
            <LaunchProgramIdentityFields {...identity}/>
            <LaunchDeliveryModelFields {...delivery}/>
            <section aria-label="Review recorded Site and proposed Program" className="rounded-xl border bg-muted/30 p-4">
              <h4 className="text-sm font-semibold">3. Review before saving the Program</h4>
              <dl className="mt-2 grid gap-x-5 gap-y-2 text-sm sm:grid-cols-2">
                <div><dt className="font-semibold">Church host</dt><dd>{host?.name??"Choose a host organization"}</dd></div>
                <div><dt className="font-semibold">Saved school Site</dt><dd>{site ? `${site.name} · ${site.timezone}` : "No Site selected"}</dd></div>
                <div><dt className="font-semibold">Physical location</dt><dd>{site?.addressStatus==="church_supplied" ? "Church supplied · independent review pending" : site ? "Not yet verified; complete Site location" : "Not selected"}</dd></div>
                <div><dt className="font-semibold">Program</dt><dd>{identity.name.trim() || "Name needed"} · {identity.gradeMin}–{identity.gradeMax}</dd></div>
                <div><dt className="font-semibold">Jurisdiction</dt><dd>{jurisdiction?.name??"Choose the Program jurisdiction"} · legal applicability not verified</dd></div>
                <div><dt className="font-semibold">Academic provider</dt><dd>{provider?.name??"Choose a provider"} · proposed only</dd></div>
                <div><dt className="font-semibold">Credit issuer</dt><dd>{hostAndProvider.creditMode==="non_credit"?"Noncredit Program":creditIssuer?.name??"Choose a credit issuer"}</dd></div>
                <div><dt className="font-semibold">Delivery</dt><dd>{[
                  delivery.onsite?"Onsite":null,delivery.liveOnline?"Live online":null,
                  delivery.asynchronous?"Asynchronous":null,
                ].filter(Boolean).join(" + ") || "Select a delivery model"}</dd></div>
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">
                Onsite days per week are planning only. The actual per-Program academic calendar,
                including eligible Sunday or weekend sessions, must be configured and approved separately.
                Saving records does not grant school-opening, admissions, publication, or CAN academic authority.
              </p>
            </section>
            <Button type="submit" disabled={busy||Boolean(created)||!canSubmit}>
              {busy?"Saving your school…":created?"School saved":"Save Program and continue to launch workspace"}
            </Button>
            {!savedSite&&delivery.onsite&&<p role="status" className="text-sm text-muted-foreground">
              Select an existing school Site or save a new one in Step 1.
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

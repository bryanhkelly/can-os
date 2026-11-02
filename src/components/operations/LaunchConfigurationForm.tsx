import type { ComponentProps, FormEvent } from "react";
import { LaunchCreatedHandoff, type LaunchCreatedResult } from "@/components/operations/LaunchCreatedHandoff";
import { LaunchSchoolModelPicker } from "@/components/operations/LaunchSchoolModelPicker";
import { LaunchProgramIdentityFields } from "@/components/operations/LaunchProgramIdentityFields";
import { LaunchDeliveryModelFields } from "@/components/operations/LaunchDeliveryModelFields";
import { LaunchHostAndProviderFields } from "@/components/operations/LaunchHostAndProviderFields";

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
 return <>
          <LaunchCreatedHandoff created={created} />
          <details id="new-school-launch" className="rounded-xl border bg-card p-5" open={!hasSchoolPreparation}>
            <summary className="cursor-pointer text-lg font-semibold">Launch a school · School Basics</summary>
            <LaunchSchoolModelPicker {...modelPresets} />
            <form className="mt-4 space-y-5" onSubmit={submitLaunch}>
              <LaunchProgramIdentityFields {...identity} />

              <LaunchDeliveryModelFields {...delivery} />

              <LaunchHostAndProviderFields {...hostAndProvider} />

              <button
                type="submit"
                className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50"
                disabled={busy || Boolean(created) || !options.organizations.length || (delivery.onsite && !hostAndProvider.siteId)}
              >
                {busy ? "Saving your school…" : created ? "School saved" : "Save school and continue"}
              </button>
              {delivery.onsite&&!hostAndProvider.siteId&&<p role="status" className="text-sm text-muted-foreground">Choose or save a school location above before continuing with onsite learning.</p>}
              {!options.organizations.length && (
                <p className="text-xs text-muted-foreground">
                  Your account does not yet have access to set up a school. Ask your CAN contact to confirm your school setup invitation.
                </p>
              )}
            </form>
          </details>
 </>;
}

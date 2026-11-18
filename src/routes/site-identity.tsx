import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { WorkspaceShell } from "@/components/workspace";

/**
 * Preserve legacy reviewer bookmarks without providing a second Person
 * creation path. A CAN staff account's public.people Person and explicitly
 * approved, exact-Site account_person_grants are authoritative.
 */
export const Route=createFileRoute("/site-identity")({
  validateSearch:(input:Record<string,unknown>)=>z.object({
    mode:z.enum(["staff"]).optional().catch("staff"),
    siteId:z.string().uuid().optional().catch(undefined),
  }).parse(input),
  component:RetiredStaffPersonCorrespondence,
});

function RetiredStaffPersonCorrespondence(){
  return <WorkspaceShell eyebrow="CAN OS / Access" title="Staff identity review"
    width="wide"
    subtitle="One verified CAN Person and one login across Sites and roles.">
    <section className="mt-6 max-w-3xl border border-border bg-card p-6">
      <h2 className="font-serif text-2xl">Staff Person correspondence retired</h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Native Person identity linking is no longer available. Staff identity is
        the existing verified CAN account's public Person. A staff member may
        serve multiple Sites and organizations, but access requires an explicit,
        currently active role grant scoped to the exact Site.
      </p>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Approval of a staff role, a Class assignment and sensitive credential
        issuance remain distinct authorization decisions. No identity mapping,
        access grant or publication approval is created from this page.
      </p>
      <a href="/admin" className="mt-5 inline-flex text-sm font-semibold underline underline-offset-4">
        Manage verified CAN accounts and scoped staff grants
      </a>
    </section>
  </WorkspaceShell>;
}

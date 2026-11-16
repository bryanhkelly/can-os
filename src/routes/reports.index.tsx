import {createFileRoute,Link} from "@tanstack/react-router";
import {WorkspaceShell} from "@/components/workspace";
import {NoncreditNetworkReportPanel} from "@/components/enrollment/NoncreditNetworkReportPanel";

export const Route=createFileRoute("/reports/")({component:ReportingHome});

/**
 * Provider reporting reuse. The noncredit service establishes current
 * Organization and authorized Site scope itself; this page never accepts
 * a client-provided Organization, network or alternate learner identity.
 */
function ReportingHome(){
  return <WorkspaceShell eyebrow="CAN OS · Operations" title="Participation reports"
    width="wide"
    subtitle="Source-backed participation across authorized learning deliveries. Distinct registrations, people, attendance, completions and awards require separate evidence.">
    <div className="mt-6 grid gap-3 md:grid-cols-2">
      <section className="border border-border bg-card p-5">
        <h2 className="font-serif text-xl">Class evidence</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Open an authorized native Class and select Reports to review its dated
          sessions, registrations, host-attested attendance, assessments and recorded awards.
        </p>
        <Link to="/classes" search={{}} className="mt-4 inline-block text-sm font-semibold text-primary underline">
          Browse my authorized Classes
        </Link>
      </section>
      <section className="border border-border bg-card p-5">
        <h2 className="font-serif text-xl">Program and Site delivery</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Noncredit release-level reports reconcile source registrations and verified evidence
          across your current operating Organization's authorized Sites.
          Independent providers remain separate.
        </p>
        <Link to="/programs/noncredit/enrollment" search={{}} className="mt-4 inline-block text-sm font-semibold text-primary underline">
          Manage noncredit delivery
        </Link>
      </section>
    </div>
    <NoncreditNetworkReportPanel/>
    <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
      Network affiliation is not a reporting entitlement. Cross-provider network
      reports and externally published impact summaries require independently approved
      host grants, disclosure controls and verified data provenance. No inferred financial
      or social-impact claims are shown here.
    </p>
  </WorkspaceShell>;
}

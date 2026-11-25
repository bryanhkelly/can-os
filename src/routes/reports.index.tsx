import {createFileRoute} from "@tanstack/react-router";
import {WorkspaceShell} from "@/components/workspace";
import {ReportCenter} from "@/components/reports/ReportCenter";

export const Route=createFileRoute("/reports/")({component:ReportingHome});
function ReportingHome(){
  return <WorkspaceShell eyebrow="CAN OS · Operations" title="Participation reports" width="wide"
    subtitle="Source-backed reporting across authorized deliveries. Registration, people, attendance, completions and awards require separate evidence.">
    <ReportCenter/>
    <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
      Network affiliation is not a reporting entitlement. Cross-provider network reports and externally published impact summaries require independently approved host grants, disclosure controls and verified provenance.
    </p>
  </WorkspaceShell>;
}

import {useState} from "react";
import {Link} from "@tanstack/react-router";
import {Button} from "@/components/ui/button";
import {WorkspacePanel,WorkspaceNotice} from "@/components/workspace";
import {reportCenterEntries,reportCatalogEntry} from "@/domain/report-catalog";
import {ProviderReportFilterProvider} from "@/hooks/use-provider-report-filters";
import {usePrivateReportScope} from "@/hooks/use-private-report-query";
import {NoncreditProviderEvidencePanel} from "./NoncreditProviderEvidencePanel";
import {NoncreditPilotOutcomesPanel} from "@/components/learning/NoncreditPilotOutcomesPanel";

/** Discovery is static; data is mounted only for the selected report.
 * Context-specific reports remain at their authorized owning workspace.
 */
export function ReportCenter(){
  const scope=usePrivateReportScope();
  const [selected,setSelected]=useState<"provider-delivery"|"noncredit-registration-outcomes">("provider-delivery");
  const classReport=reportCatalogEntry("native-class-evidence")!;
  if(scope===null)return <WorkspaceNotice tone="attention">A current verified workspace session is required to open private reports.</WorkspaceNotice>;
  return <ProviderReportFilterProvider key={scope} scope={scope}><div className="mt-6 space-y-6">
    <WorkspacePanel title="Report catalog" description="Private operational reports. Each report independently verifies current access.">
      <div className="grid gap-3 md:grid-cols-3">
        {reportCenterEntries.map(entry=><div key={entry.id} className="border border-border p-4 space-y-2">
          <h3 className="font-semibold">{entry.title}</h3>
          <p className="text-sm text-muted-foreground">{entry.description}</p>
          <Button type="button" size="sm" variant={selected===entry.id?"default":"outline"}
            aria-pressed={selected===entry.id} onClick={()=>{if(entry.id==="provider-delivery"||entry.id==="noncredit-registration-outcomes")setSelected(entry.id);}}>
            {selected===entry.id?"Selected":"Open report"}
          </Button>
        </div>)}
        <div className="border border-border p-4 space-y-2">
          <h3 className="font-semibold">{classReport.title}</h3>
          <p className="text-sm text-muted-foreground">{classReport.description}</p>
          <Link to="/class" search={{view:"manage"}} className="inline-block text-sm font-semibold text-primary underline">Browse native Classes</Link>
        </div>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">Site campaign, Go Link and platform infrastructure reports remain in their owning workspaces. Network-wide and external impact reports are not enabled by catalog membership.</p>
    </WorkspacePanel>
    <div className="flex justify-end"><Link to="/programs/noncredit/enrollment" search={{}} className="text-sm font-semibold text-primary underline">Manage noncredit delivery</Link></div>
    <p className="text-xs text-muted-foreground">Geography and Site selections carry between provider reports. Delivery uses current Site geography; learning outcomes use geography at registration. Date windows apply only where supported.</p>
    <div key={scope+":"+selected}>
      {selected==="provider-delivery"?<NoncreditProviderEvidencePanel/>:<NoncreditPilotOutcomesPanel/>}
    </div>
  </div></ProviderReportFilterProvider>;
}

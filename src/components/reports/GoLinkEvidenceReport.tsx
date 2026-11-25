import {useState} from "react";
import {Button} from "@/components/ui/button";
import {ReportDocumentView,type ReportDocument} from "@/components/workspace/report-document";
import {bindRegisteredCounts,goReportDefinitions} from "@/domain/reporting-view-definitions";

/** Structural DTO subset only; no import of a server module into presentation. */
type Evidence={
  redirects30d:number;linkOpens30d:number;pageViews30d:number;redirectResponses30d:number;unclassifiedEntries30d:number;
  referralRegistrations30d:number|null;registrationEvidence:"referenced_noncredit_claim"|"not_connected";
  periodStart:string;periodEnd:string;
};
export function GoLinkEvidenceReport({evidence}:{evidence:Evidence}){
  const [open,setOpen]=useState(false);
  const definitions=goReportDefinitions();
  const items=bindRegisteredCounts(definitions,{
    observedRedirects30d:evidence.redirects30d,linkOpens30d:evidence.linkOpens30d,
    pageViews30d:evidence.pageViews30d,redirectResponses30d:evidence.redirectResponses30d,
    unclassifiedEntries30d:evidence.unclassifiedEntries30d,
    referralNoncreditRegistrations30d:evidence.registrationEvidence==="referenced_noncredit_claim"?evidence.referralRegistrations30d:null,
  });
  const report:ReportDocument={version:1,definitionId:"go-link-evidence-v1",title:"Go Link distribution evidence",
    scopeLabel:"This authorized link only",basis:"UTC calendar days "+evidence.periodStart+" through "+evidence.periodEnd+" inclusive; current day is partial",
    definitions,blocks:[
      {id:"traffic",kind:"chart",spec:{title:"Observed request activity",description:"Anonymous, unfiltered requests may include automation. Counts overlap; they are not unique people.",valueLabel:"Requests",kind:"comparison",format:"count",points:items.filter(item=>item.id!=="go.referralNoncreditRegistrations30d")}},
      {id:"claims",kind:"metrics",items:items.filter(item=>item.id==="go.referralNoncreditRegistrations30d")},
      {id:"caveat",kind:"note",text:"Registration claims reference the link code and authorized release. They do not establish a causal conversion. Unconnected outcome types remain unavailable."},
    ]};
  return <div className="space-y-3">
    <Button type="button" variant="outline" size="sm" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{open?"Hide reporting details":"View reporting details"}</Button>
    {open&&<ReportDocumentView report={report}/>}
  </div>;
}

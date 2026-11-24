import {useProviderReportFilters} from "@/hooks/use-provider-report-filters";
import {useProviderReportOptions} from "@/hooks/use-provider-report-options";
import {providerDeliveryQueryKey} from "@/domain/report-filter-state";
import {ProviderReportFilters} from "./ProviderReportFilters";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, TableRowHead } from "@/components/ui/table";
import {useMemo,useState} from "react";
import {Button} from "@/components/ui/button";
import {ReportMetricCard} from "@/components/workspace/report-metric-card";
import {ReportRankedComparison} from "@/components/workspace/report-ranked-comparison";
import {usePrivateReportQuery,usePrivateReportScope} from "@/hooks/use-private-report-query";
import {ReportChart} from "@/components/workspace/report-chart";
import {getNoncreditOperatorNetworkSummary} from "@/modules/enrollment/noncredit-network-report.functions";
import {reportingCsvRow} from "@/domain/reporting-csv";

/** Private operator CSV shares the formula-safe serializer with Class reports. */
function savePrivateCsv(rows:readonly (readonly (string|number|null)[])[],filename:string){
  const source=rows.map(reportingCsvRow).join("\r\n");
  const blob=new Blob([source],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;link.download=filename;
  document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
}

/**
 * Existing one-operator noncredit evidence service remains the source of
 * truth. This is NOT a cross-provider network endpoint. No browser-supplied
 * Organization/Site ID is sent to the server: the backend resolves current
 * canonical principal, role and scoped permitted Sites on every request.
 */
export function NoncreditProviderEvidencePanel(){
  const scope=usePrivateReportScope();
  const controller=useProviderReportFilters(scope);
  const {geography,siteId:requestedSite}=controller.filters;
  const options=useProviderReportOptions(scope,"current",controller.filters);
  const [showDefinitions,setShowDefinitions]=useState(false);
  const {query:response,data}=usePrivateReportQuery({scope,key:providerDeliveryQueryKey(geography),enabled:options.ready,read:()=>getNoncreditOperatorNetworkSummary({data:{geography}})});
  const site=data?.sites.find(s=>s.siteId===requestedSite)??null;
  const selectionUnavailable=!!requestedSite&&!site;
  const siteId=site?.siteId??"";
  const selectedCohorts=useMemo(()=>selectionUnavailable?[]:data?.cohorts.filter(c=>!siteId||c.siteId===siteId)??[],
    [data,siteId,selectionUnavailable]);
  const totals=selectionUnavailable?undefined:site??data?.totals;
  const definitions=[
    {label:"Registrations",source:"noncredit_self_enrollment_claims + noncredit_registrations",
      grain:"Unique canonical registration",meaning:"Counts registrations including later withdrawals; not distinct people"},
    {label:"Currently active",source:"noncredit_registrations.status",
      grain:"Registration",meaning:"Current registered or active status, not historical status as of an earlier date"},
    {label:"Withdrawn",source:"noncredit_registrations.status",
      grain:"Registration",meaning:"Current withdrawn status; original participation history remains"},
    {label:"Confirmed noncredit completions",source:"noncredit_completion_decisions",
      grain:"Registration with latest completed decision",meaning:"An explicit governed decision; not derived from playback or responses"},
    {label:"Registrations with host-attested attendance",source:"facilitated_room_attendance_assertions",
      grain:"Registration with latest present assertion in linked room",
      meaning:"One registration counted once per release. Can repeat across releases, so it is not unique people across the Organization"},
    {label:"Linked rooms",source:"facilitated_classroom_plans",
      grain:"Linked facilitated room",meaning:"Links to a release only; does not itself prove delivered or completed Session"},
  ] as const;
  function exportCsv(){
    if(!data)return;
    const rows:(string|number|null)[][]=[
      ["Site","Training","Release ID","Delivery","Registrations","Active registrations",
        "Withdrawn registrations","Confirmed noncredit completions",
        "Registrations with host-attested attendance","Linked rooms","As of UTC",
        "Delivery geography filter","Site filter","Geography basis","Data classification"],
      ...selectedCohorts.map(c=>[
        c.siteName,c.trainingTitle,c.releaseId,c.deliveryMode,c.registrations,c.active,
        c.withdrawn,c.completed,c.verifiedAttendees,c.linkedRooms,data.asOf,geography||"all",requestedSite||"all","current",
        "PRIVATE OPERATOR EVIDENCE - NOT APPROVED FOR PUBLICATION",
      ]),
    ];
    savePrivateCsv(rows,"can-os-private-noncredit-evidence-"+data.asOf.slice(0,10)+".csv");
  }
  return <section aria-label="Authorized Program and Site reporting" className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Noncredit learning · provider evidence</p>
        <h2 className="mt-1 font-serif text-2xl font-semibold">Program and Site reporting</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          One currently authorized operating Organization and its authorized Sites.
          These figures are source-backed registrations, not automatically distinct people.
        </p>
      </div>
      <Button type="button" variant="outline" disabled={!data||!selectedCohorts.length}
        onClick={exportCsv}>
        Export private evidence CSV
      </Button>
    </div>
    {scope!==null&&options.ready&&(response.isPending||response.isFetching)&&<p role="status" className="border border-border p-4 text-sm">
      Reconciling authorized releases and canonical outcomes…
    </p>}
    {scope!==null&&options.ready&&response.isError&&<p role="alert" className="border border-border p-4 text-sm">
      The current account cannot access this provider report, or reporting exceeds
      the service's safe result bounds. No partial totals are displayed.
    </p>}
    {scope!==null&&<ProviderReportFilters controller={controller} options={options} basis="current"/>}
    {data&&<>
      <div className="border border-border bg-card p-4 text-xs text-muted-foreground">
        <p>As of {data.asOf}</p>
        <p>Lifetime registered releases. Historical time-window selection requires a versioned source lifecycle projection.</p>
      </div>
      {selectionUnavailable&&<p role="status" className="text-sm text-muted-foreground">No release evidence matches the selected Site and current geography. The selection remains applied.</p>}
      {data.sites.length>0&&data.sites.length<=60&&<ReportRankedComparison title="Registrations by authorized Site" description="Select a Site to filter the metrics, release chart and release evidence below. This does not open a new reporting scope."
        rows={data.sites.map(s=>({id:s.siteId,label:s.siteName,value:s.registrations}))} selectedId={requestedSite} onSelect={value=>controller.dispatch({type:"site",value})}/>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {([
          ["Registrations",totals?.registrations],
          ["Currently active",totals?.active],
          ["Withdrawn",totals?.withdrawn],
          ["Confirmed noncredit completions",totals?.completed],
          ["Registrations with host-attested attendance",totals?.verifiedAttendees],
          ["Linked rooms (not delivery proof)",totals?.linkedRooms],
        ] as const).map(([label,value])=>
          <ReportMetricCard key={label} item={{id:label,label,value:value??null,asOf:data.asOf}}/>
        )}
      </div>
      {selectedCohorts.length>0&&selectedCohorts.length<=20&&<ReportChart spec={{
        title:"Registration counts by release",description:"The selected authorized Site filter applies to both this chart and the release detail table.",
        kind:"comparison",format:"count",valueLabel:"Registrations",
        points:selectedCohorts.map(c=>({id:c.releaseId,label:c.trainingTitle+" · "+c.siteName,value:c.registrations})),
      }}/>}
      <div className="border border-border bg-card">
        <Table scrollLabel="Release-level evidence drill-down" aria-label="Release-level evidence drill-down" className="w-full min-w-[40rem] text-left text-sm">
          <TableCaption className="p-4 text-left font-semibold">Release-level evidence drill-down</TableCaption>
          <TableHeader className="border-y border-border bg-muted/40">
            <TableRow>
              <TableHead scope="col" className="p-3">Training / Release</TableHead>
              <TableHead scope="col" className="p-3">Delivery Site</TableHead>
              <TableHead scope="col" className="p-3">Registered</TableHead>
              <TableHead scope="col" className="p-3">Attested</TableHead>
              <TableHead scope="col" className="p-3">Completed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{selectedCohorts.map(c=><TableRow key={c.releaseId} className="border-b border-border">
            <TableRowHead  className="p-3 font-medium">
              {c.trainingTitle}<span className="mt-1 block font-mono text-xs font-normal text-muted-foreground">
                {c.releaseId}
              </span>
            </TableRowHead>
            <TableCell className="p-3">{c.siteName}</TableCell>
            <TableCell className="p-3 tabular-nums">{c.registrations.toLocaleString()}</TableCell>
            <TableCell className="p-3 tabular-nums">{c.verifiedAttendees.toLocaleString()}</TableCell>
            <TableCell className="p-3 tabular-nums">{c.completed.toLocaleString()}</TableCell>
          </TableRow>)}
          {!selectedCohorts.length&&<TableRow><TableCell colSpan={5} className="p-4 text-muted-foreground">
            No releases match the selected Site and geography.
          </TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <section className="border border-border bg-card p-4">
        <Button type="button" variant="ghost" aria-expanded={showDefinitions}
          onClick={()=>setShowDefinitions(x=>!x)}
          className="flex w-full justify-between gap-4 px-0 text-left">
          Metric definitions and source interpretation
          <span aria-hidden="true">{showDefinitions?"−":"+"}</span>
        </Button>
        {showDefinitions&&<div className="mt-3">
          <Table scrollLabel="Metric definitions and source interpretation" aria-label="Metric definitions and source interpretation" className="w-full min-w-[36rem] text-left text-sm"><TableCaption className="sr-only">Metric definitions and source interpretation</TableCaption>
            <TableHeader className="border-b border-border">
              <TableRow><TableHead className="p-3">Metric</TableHead><TableHead className="p-3">Source</TableHead><TableHead className="p-3">Counting rule</TableHead></TableRow>
            </TableHeader>
            <TableBody>{definitions.map(item=><TableRow key={item.label} className="border-b border-border">
              <TableRowHead  className="p-3">{item.label}</TableRowHead>
              <TableCell className="p-3 font-mono text-xs">{item.source}</TableCell>
              <TableCell className="p-3">{item.grain}. {item.meaning}.</TableCell>
            </TableRow>)}</TableBody>
          </Table>
        </div>}
      </section>
      <p className="border-t border-border pt-3 text-xs text-muted-foreground">
        Internal operator-only evidence, not approved for public release or use as verified
        funding impact. Cross-provider network access requires independently authorized host
        grants and disclosure review. Distinct people across releases, official school
        attendance, verified delivered Sessions and financial outcomes are not provided by
        this noncredit summary service.
      </p>
    </>}
  </section>;
}

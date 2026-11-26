import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, TableRowHead } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/choice";
import { DisclosureSection, WorkspaceNotice, WorkspacePanel } from "@/components/workspace";
import {useState} from "react";
import {usePrivateReportQuery,usePrivateReportScope} from "@/hooks/use-private-report-query";
import {ReportDateFilter} from "@/components/workspace/report-date-filter";
import {utcDaysThroughToday,priorReportDateRange,resolveReportDateRange,type ReportDateRange} from "@/components/workspace/report-date-range";
import {ReportMetricComparison} from "@/components/workspace/report-period-comparison";
import {getNativeClassReport} from "@/modules/reporting/native-class-report.functions";
import {downloadReportingCsv} from "@/lib/reporting-download";

function exportReport(report:NonNullable<ReturnType<typeof useClassReport>["data"]>){
  // Stable metric keys, availability and source lineage for future Insights reuse.
  // Aggregates only; never export individual learners from this route.
  const rows:(string|number|null)[][]=[
    ["Metric key","Metric","Value","Evidence availability","Source","Denominator","Rule",
      "Time basis","Period start (UTC)","Period end exclusive (UTC)","As of",
      "Contract","Data classification"],
    ...report.definitions.map(def=>[
      def.key,def.label,report.metrics[def.key],
      report.metrics[def.key]===null?"unavailable":"available",
      def.source,def.denominator,def.rule,def.timeBasis,
      report.period.from,report.period.to,report.asOf,report.contractVersion,
      "PRIVATE OPERATOR EVIDENCE - NOT APPROVED FOR PUBLICATION",
    ]),
  ];
  downloadReportingCsv(rows,"can-os-class-evidence-"+report.classId+"-"+report.period.from.slice(0,10)+".csv");
}
function useClassReport(classId:string,range:ReportDateRange|null,scope:string|null,enabled=true){
  return usePrivateReportQuery({
    scope,key:["native-class-evidence",classId,range?.fromDay??null,range?.untilDay??null],
    enabled:enabled&&range!==null,read:()=>getNativeClassReport({data:{classId,from:range!.fromDay,to:range!.untilDay}}),
  });
}

/** WS6 provider-private reporting component; 6.1 semantic tokens and
 * rectangular panels. No cross-provider publish button is exposed. */
export function NativeClassReportPanel({classId}:{classId:string}){
  const scope=usePrivateReportScope();
  const [range,setRange]=useState(()=>utcDaysThroughToday(30,new Date()));
  const [compare,setCompare]=useState(false);
  const valid=resolveReportDateRange(range,366,new Date(),true)!==null;
  const {query:report,data}=useClassReport(classId,valid?range:null,scope);
  const priorRange=priorReportDateRange(range,366,new Date());
  const {query:previous,data:previousData}=useClassReport(classId,priorRange,scope,compare);
  const comparable=compare&&data&&previousData&&data.contractVersion===previousData.contractVersion?previousData:null;
  return <section aria-label="Class participation reports" className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Evidence reporting · WS6</p>
        <h2 className="mt-1 font-serif text-2xl font-semibold">Class reports</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Private, source-reconciled operational evidence. All times use UTC.
        </p>
      </div>
      <Button variant="outline" type="button" disabled={!data} onClick={()=>data&&exportReport(data)}
        size="lg">
        Export evidence CSV
      </Button>
    </div>
    <WorkspacePanel headingLevel="h3" title="Reporting period"><div className="space-y-3">
      <ReportDateFilter initial={range} maxDays={366} allowPartialToday onApply={setRange}/>
      <Label className="flex items-center gap-2 text-sm">
        <Checkbox checked={compare} onChange={e=>setCompare(e.target.checked)}/> Compare equal-length prior period
      </Label>
      {compare&&!priorRange&&<WorkspaceNotice>Choose a completed UTC window for an equal-period comparison. Today is partial.</WorkspaceNotice>}
      {compare&&priorRange&&<p className="text-xs text-muted-foreground">Prior window: {priorRange.fromDay} to {priorRange.untilDay} exclusive (UTC). Both cohorts reflect their source state at query time, not historical snapshots.</p>}
    </div></WorkspacePanel>
    {scope===null&&<WorkspaceNotice tone="attention">A current verified workspace session is required.</WorkspaceNotice>}
    {!valid&&<WorkspaceNotice tone="attention">Choose ascending dates covering no more than 366 days.</WorkspaceNotice>}
    {scope!==null&&valid&&(report.isPending||report.isFetching)&&<WorkspaceNotice>Reconciling verified Class records…</WorkspaceNotice>}
    {scope!==null&&valid&&report.isError&&<WorkspaceNotice tone="danger">Reporting is unavailable with your current Class permissions or this reporting interval exceeds safety limits.</WorkspaceNotice>}
    {data&&<>
      <p className="text-xs text-muted-foreground">
        As of {new Date(data.asOf).toLocaleString()} · Contract {data.contractVersion}
        {" · "}Exact authorized delivery Site only. Not approved for external publication.
      </p>
      {data.definitions.some(def=>data.metrics[def.key]===null)&&
        <WorkspaceNotice>
          Unavailable metrics are not zero. Their underlying authoritative evidence or
          governed decision source is not yet reportable.
        </WorkspaceNotice>}
      <ReportMetricComparison compare={compare&&priorRange!==null} items={data.definitions.map(def=>({
        id:def.key,label:def.label,value:data.metrics[def.key],prior:comparable?.metrics[def.key],hint:def.denominator,asOf:data.asOf,
      }))}/>
      {compare&&previous.isError&&<WorkspaceNotice tone="attention">Prior-period comparison is unavailable. Current period remains independently sourced.</WorkspaceNotice>}
      <DisclosureSection title="Metric definitions and audit trail">
          <Table scrollLabel="Class metric definitions and audit trail" aria-label="Class metric definitions and audit trail" className="w-full min-w-[42rem] text-left text-sm"><TableCaption className="sr-only">Class metric definitions and audit trail</TableCaption>
            <TableHeader className="border-b border-border bg-muted/40"><TableRow>
              <TableHead scope="col" className="p-3">Metric</TableHead>
              <TableHead scope="col" className="p-3">Authoritative source</TableHead>
              <TableHead scope="col" className="p-3">Counting rule</TableHead>
              <TableHead scope="col" className="p-3">Time basis</TableHead>
            </TableRow></TableHeader>
            <TableBody>{data.definitions.map(def=><TableRow key={def.key} className="border-b border-border">
              <TableRowHead  className="p-3">{def.label}</TableRowHead>
              <TableCell className="p-3 font-mono text-xs">{def.source}</TableCell>
              <TableCell className="p-3">{def.rule}</TableCell>
              <TableCell className="p-3">{def.timeBasis}</TableCell>
            </TableRow>)}</TableBody>
          </Table>
      </DisclosureSection>
      <div className="border-t border-border pt-3 text-xs text-muted-foreground">
        {data.limitations.map(item=><p key={item} className="mt-2">{item}</p>)}
      </div>
    </>}
  </section>;
}

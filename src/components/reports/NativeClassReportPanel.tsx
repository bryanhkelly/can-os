import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, TableRowHead } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/choice";
import {useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {getNativeClassReport} from "@/modules/reporting/native-class-report.functions";
import {useActiveWorkspaceMember} from "@/components/shell/workspace-session-context";

function datePlus(value:string,days:number){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return "";
  const d=new Date(value+"T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate()+days);
  return d.toISOString().slice(0,10);
}
function csvCell(value:string|number|null){
  const text=value===null?"Unavailable":String(value);
  return '"'+text.replaceAll('"','""')+'"';
}
function exportReport(report:NonNullable<ReturnType<typeof useClassReport>["data"]>){
  // Aggregates and definitions only. Never export personal enrollment records.
  const lines=[
    ["Metric","Value","Source","Denominator","Rule","Time basis","Period start (UTC)","Period end exclusive (UTC)","As of","Contract"].join(","),
    ...report.definitions.map(def=>[
      def.label,report.metrics[def.key],def.source,def.denominator,def.rule,def.timeBasis,
      report.period.from,report.period.to,report.asOf,report.contractVersion,
    ].map(v=>csvCell(v)).join(",")),
  ];
  const file=new Blob([lines.join("\r\n")],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(file);
  const link=document.createElement("a");
  link.href=url;link.download="can-os-class-evidence-"+report.classId+"-"+report.period.from.slice(0,10)+".csv";
  document.body.appendChild(link);link.click();link.remove();
  URL.revokeObjectURL(url);
}
function useClassReport(classId:string,from:string,to:string,grantKey:string,enabled=true){
  return useQuery({
    queryKey:["ws6-class-report",grantKey,classId,from,to],
    queryFn:()=>getNativeClassReport({data:{classId,from,to}}),
    enabled:enabled&&from<to,retry:false,staleTime:0,gcTime:0,refetchOnMount:"always",
  });
}

/** WS6 provider-private reporting component; 6.1 semantic tokens and
 * rectangular panels. No cross-provider publish button is exposed. */
export function NativeClassReportPanel({classId}:{classId:string}){
  const today=new Date().toISOString().slice(0,10);
  const grantKey=useActiveWorkspaceMember()?.id??"unbound-canonical-session";
  const [from,setFrom]=useState(()=>datePlus(today,-30));
  const [toInclusive,setToInclusive]=useState(today);
  const [compare,setCompare]=useState(false);
  const [expanded,setExpanded]=useState(false);
  const to=datePlus(toInclusive,1);
  const report=useClassReport(classId,from,to,grantKey);
  const length=Math.round((Date.parse(to+"T00:00:00Z")-
    Date.parse(from+"T00:00:00Z"))/86400000);
  const previousFrom=datePlus(from,-length);
  const previous=useClassReport(classId,previousFrom,from,grantKey,compare&&length>0&&length<=366);
  const valid=!!from&&!!toInclusive&&from<=toInclusive&&length>0&&length<=366;
  const data=valid?report.data:null;
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
        className="min-h-11 border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50">
        Export evidence CSV
      </Button>
    </div>
    <div className="grid gap-3 border border-border bg-card p-4 md:grid-cols-[1fr_1fr_auto]">
      <Label className="block text-sm font-medium">From (UTC, inclusive)
        <Input type="date" value={from} max={today} onChange={e=>setFrom(e.target.value)}
          className="mt-2 block min-h-11 w-full border border-border bg-background px-3 text-sm"/>
      </Label>
      <Label className="block text-sm font-medium">Through (UTC, inclusive)
        <Input type="date" value={toInclusive} max={today} onChange={e=>setToInclusive(e.target.value)}
          className="mt-2 block min-h-11 w-full border border-border bg-background px-3 text-sm"/>
      </Label>
      <Label className="flex items-center gap-2 self-end pb-3 text-sm">
        <Checkbox checked={compare} onChange={e=>setCompare(e.target.checked)}
          className="h-4 w-4"/>Compare prior period
      </Label>
    </div>
    {!valid&&<p role="alert" className="border border-border p-3 text-sm">
      Choose ascending dates covering no more than 366 days.
    </p>}
    {valid&&report.isPending&&<p role="status" className="border border-border p-4 text-sm">
      Reconciling verified Class records…
    </p>}
    {valid&&report.isError&&<p role="alert" className="border border-border p-4 text-sm">
      Reporting is unavailable with your current Class permissions or this reporting interval exceeds safety limits.
    </p>}
    {data&&<>
      <p className="text-xs text-muted-foreground">
        As of {new Date(data.asOf).toLocaleString()} · Contract {data.contractVersion}
        {" · "}Exact authorized delivery Site only. Not approved for external publication.
      </p>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.definitions.map(def=>{
          const value=data.metrics[def.key];
          const old=previous.data?.metrics[def.key];
          return <div key={def.key} className="border border-border bg-card p-4">
            <dt className="text-xs font-medium text-muted-foreground">{def.label}</dt>
            <dd className="mt-2 font-serif text-3xl font-semibold tabular-nums">
              {value===null?"Not available":value.toLocaleString()}
            </dd>
            {compare&&old!==undefined&&old!==null&&value!==null&&
              <p className="mt-2 text-xs text-muted-foreground">
                Prior {old.toLocaleString()} · Change {value-old>0?"+":""}{(value-old).toLocaleString()}
              </p>}
            <p className="mt-2 text-xs text-muted-foreground">{def.denominator}</p>
          </div>;
        })}
      </dl>
      {compare&&previous.isError&&<p role="status" className="text-sm">
        Prior-period comparison is unavailable. Current period remains independently sourced.
      </p>}
      <section className="border border-border bg-card p-4">
        <Button variant="ghost" type="button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}
          className="flex min-h-11 w-full items-center justify-between gap-3 text-left font-semibold">
          <span>Metric definitions and audit trail</span><span aria-hidden="true">{expanded?"−":"+"}</span>
        </Button>
        {expanded&&<div className="mt-3">
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
        </div>}
      </section>
      <div className="border-t border-border pt-3 text-xs text-muted-foreground">
        {data.limitations.map(item=><p key={item} className="mt-2">{item}</p>)}
      </div>
    </>}
  </section>;
}

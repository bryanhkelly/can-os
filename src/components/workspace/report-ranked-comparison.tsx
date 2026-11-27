import {Table,TableBody,TableCaption,TableCell,TableHead,TableHeader,TableRow,TableRowHead} from "@/components/ui/table";
import {Button} from "@/components/ui/button";
import {DashboardPanel} from "./dashboard-layout";
import {EmptyState} from "./empty-state";
import {WorkspaceNotice} from "./notice";
import {formatReportValue,isReportValue,type ReportValueFormat} from "@/domain/report-value-format";
export type ReportRankedRow={id:string;label:string;value:number|null};
/** The caller supplies an already-authorized bounded comparison. No fetch,
 * authorization, route construction or implicit access escalation. */
export function ReportRankedComparison({title,description,rows,format="count",selectedId,onSelect}:{title:string;description:string;rows:readonly ReportRankedRow[];format?:ReportValueFormat;selectedId?:string;onSelect?:(id:string)=>void}){
  const valid=rows.length<=60&&new Set(rows.map(row=>row.id)).size===rows.length&&rows.every(row=>row.id.trim()&&row.label.trim()&&(row.value===null||isReportValue(row.value,format)));
  const ordered=valid?[...rows].sort((a,b)=>(b.value??-1)-(a.value??-1)||a.id.localeCompare(b.id)):[];
  const maximum=Math.max(0,...ordered.map(row=>row.value??0));
  return <DashboardPanel title={title} description={description} headingLevel="h3">
    {!valid?<WorkspaceNotice tone="attention">Comparison is invalid or exceeds the safe display limit.</WorkspaceNotice>:!rows.length?<EmptyState title="No comparable records"/>:
      <Table scrollLabel={title+" scrollable values"} aria-label={title}>
        <TableCaption className="sr-only">Descending measured values; unavailable values appear last. Bars share the same maximum.</TableCaption>
        <TableHeader><TableRow><TableHead scope="col">Category</TableHead><TableHead scope="col" className="text-right">Value</TableHead>{onSelect&&<TableHead scope="col">Filter report</TableHead>}</TableRow></TableHeader>
        <TableBody>{ordered.map(row=><TableRow key={row.id}>
          <TableRowHead className="break-words [overflow-wrap:anywhere]">{row.label}
            {row.value!==null&&<div aria-hidden="true" className="mt-2 h-2 w-full bg-muted print:hidden"><div className="h-full bg-[var(--report-series-1)]" style={{width:maximum?row.value/maximum*100+"%":"0%"}}/></div>}
          </TableRowHead>
          <TableCell className="text-right tabular-nums">{formatReportValue(row.value,format)}</TableCell>
          {onSelect&&<TableCell><Button type="button" size="sm" variant={selectedId===row.id?"outline-selected":"outline"} aria-pressed={selectedId===row.id} aria-label={"Filter report to "+row.label} onClick={()=>onSelect(row.id)}>Filter</Button></TableCell>}
        </TableRow>)}</TableBody>
      </Table>}
  </DashboardPanel>;
}

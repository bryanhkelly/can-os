import {Table,TableBody,TableCaption,TableCell,TableHead,TableHeader,TableRow,TableRowHead} from "@/components/ui/table";
import type {SourceMetricContract} from "@/domain/reporting-metric-registry";
/** Source definitions, not a registry lookup or an authorization decision. */
export function ReportMetricDefinitions({title,definitions,expanded=false}:{title:string;definitions:readonly SourceMetricContract[];expanded?:boolean}){
  if(!definitions.length)return null;
  return <details open={expanded?true:undefined} className="border border-border bg-card p-4">
    <summary className="cursor-pointer text-sm font-semibold">Metric definitions and evidence sources</summary>
    <Table scrollLabel={title+" metric definitions"} aria-label={title+" metric definitions"}>
      <TableCaption className="sr-only">Metric definitions and versions</TableCaption>
      <TableHeader><TableRow><TableHead scope="col">Metric</TableHead><TableHead scope="col">Source and version</TableHead><TableHead scope="col">Counting rule</TableHead></TableRow></TableHeader>
      <TableBody>{definitions.map(d=><TableRow key={d.metricKey+":"+d.definitionVersion}>
        <TableRowHead>{d.label}</TableRowHead><TableCell className="break-words [overflow-wrap:anywhere]">{d.source} · v{d.definitionVersion}</TableCell>
        <TableCell>{d.denominator}. {d.rule} {d.timeBasis}.</TableCell>
      </TableRow>)}</TableBody>
    </Table>
  </details>;
}

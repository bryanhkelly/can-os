import { lazy, Suspense, useId } from "react";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, TableRowHead } from "@/components/ui/table";
import { formatReportChartValue, validateReportChart, type ReportChartSpec } from "./report-chart-data";
const ReportChartPlot = lazy(() => import("./report-chart-plot"));

/** V6.1 visualization. No queries, metric inference, or authorization decisions.
 * The exact-value table is available even during plot loading.
 */
export function ReportChart({spec}: {spec: ReportChartSpec}) {
  const titleId = useId();
  const valid = validateReportChart(spec);
  const hasValues = valid && spec.points.some(p => p.value !== null);
  return <section aria-labelledby={titleId} className="min-w-0 space-y-3 border border-border bg-card p-4">
    <h3 id={titleId} className="font-semibold">{spec.title}</h3>
    <p className="text-sm text-muted-foreground">{spec.description}</p>
    {!valid ? <p role="alert" className="text-sm text-muted-foreground">Invalid or unbounded chart data. Use the source report.</p> :
      <>
        {hasValues ? <Suspense fallback={<p className="text-sm text-muted-foreground">Loading chart… Exact values are below.</p>}>
          <ReportChartPlot spec={spec}/>
        </Suspense> : <p className="text-sm text-muted-foreground">No reported values available.</p>}
        {spec.points.length > 0 && <Table scrollLabel={spec.title + " exact values"} aria-label={spec.title + " exact values"}>
          <TableCaption className="sr-only">{spec.title} exact values</TableCaption>
          <TableHeader><TableRow><TableHead scope="col">Category</TableHead><TableHead scope="col" className="text-right">{spec.valueLabel}</TableHead></TableRow></TableHeader>
          <TableBody>{spec.points.map(p => <TableRow key={p.id}>
            <TableRowHead>{p.label}</TableRowHead>
            <TableCell className="text-right tabular-nums">{formatReportChartValue(p.value,spec.format)}</TableCell>
          </TableRow>)}</TableBody>
        </Table>}
      </>}
  </section>;
}

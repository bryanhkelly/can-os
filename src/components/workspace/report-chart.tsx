import { Component, lazy, Suspense, useId, type ReactNode } from "react";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, TableRowHead } from "@/components/ui/table";
import { formatReportChartValue, hasReportChartValues, validateReportChart, type ReportChartSpec } from "./report-chart-data";
import { reportSeriesColors } from "./report-chart-palette";
const ReportChartPlot=lazy(()=>import("./report-chart-plot"));
class PlotBoundary extends Component<{children:ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<p role="status" className="text-sm text-muted-foreground">Chart unavailable. Exact values are below.</p>:this.props.children;}
}
function SeriesLabel({label,index}:{label:string;index:number}){
  return <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="inline-block size-3 shrink-0 border border-border" style={{background:reportSeriesColors[index]}}/>{label}</span>;
}
function ReportExactValues({spec}:{spec:ReportChartSpec}){
  const label=spec.title+" exact values";
  if(spec.kind==="stacked"){
    if(!spec.rows.length)return null;
    return <Table scrollLabel={label} aria-label={label}>
      <TableCaption className="sr-only">{label}</TableCaption>
      <TableHeader><TableRow><TableHead scope="col">Category</TableHead>
        {spec.series.map((s,i)=><TableHead key={s.id} scope="col" className="text-right"><SeriesLabel label={s.label} index={i}/></TableHead>)}
        <TableHead scope="col" className="text-right">Total</TableHead></TableRow></TableHeader>
      <TableBody>{spec.rows.map(row=><TableRow key={row.id}><TableRowHead>{row.label}</TableRowHead>
        {row.values.map((v,i)=><TableCell key={spec.series[i]!.id} className="text-right tabular-nums">{formatReportChartValue(v,spec.format)}</TableCell>)}
        <TableCell className="text-right tabular-nums">{formatReportChartValue(row.total,spec.format)}</TableCell></TableRow>)}</TableBody>
    </Table>;
  }
  if(!spec.points.length)return null;
  return <Table scrollLabel={label} aria-label={label}>
    <TableCaption className="sr-only">{label}</TableCaption>
    <TableHeader><TableRow><TableHead scope="col">Category</TableHead><TableHead scope="col" className="text-right">{spec.valueLabel}</TableHead></TableRow></TableHeader>
    <TableBody>{spec.points.map((p,i)=><TableRow key={p.id}>
      <TableRowHead>{spec.kind==="distribution"?<SeriesLabel label={p.label} index={i}/>:p.label}</TableRowHead>
      <TableCell className="text-right tabular-nums">{formatReportChartValue(p.value,spec.format)}</TableCell>
    </TableRow>)}</TableBody>
  </Table>;
}
/** V6.1 presentation. Chart failure never removes the exact-value table. */
export function ReportChart({spec}:{spec:ReportChartSpec}){
  const titleId=useId();
  const valid=validateReportChart(spec);
  return <section aria-labelledby={titleId} className="min-w-0 space-y-3 border border-border bg-card p-4">
    <h3 id={titleId} className="font-semibold">{spec.title}</h3>
    <p className="text-sm text-muted-foreground">{spec.description}</p>
    {!valid?<p role="alert" className="text-sm text-muted-foreground">Invalid or unbounded chart data. Use the source report.</p>:<>
      {"population" in spec&&<p className="text-xs text-muted-foreground">Population: {spec.population}{spec.kind==="distribution"?". Total: "+formatReportChartValue(spec.total,spec.format):""}</p>}
      {hasReportChartValues(spec)?<PlotBoundary key={spec.kind+":"+spec.title}>
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading chart… Exact values are below.</p>}><ReportChartPlot spec={spec}/></Suspense>
      </PlotBoundary>:<p className="text-sm text-muted-foreground">No reported values available.</p>}
      <ReportExactValues spec={spec}/>
    </>}
  </section>;
}

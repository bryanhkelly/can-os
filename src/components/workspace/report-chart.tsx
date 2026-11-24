import { Component, lazy, Suspense, type ReactNode } from "react";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, TableRowHead } from "@/components/ui/table";
import { formatReportChartValue, hasReportChartValues, hasNonzeroReportChartValues, validateReportChart, type ReportChartSpec } from "./report-chart-data";
import {DashboardPanel} from "./dashboard-layout";
import {EmptyState} from "./empty-state";
import {WorkspaceNotice} from "./notice";
import {QueryState} from "./query-state";
import {ReportSeriesMark,ReportSeriesLegend} from "./report-chart-marks";
const ReportChartPlot=lazy(()=>import("./report-chart-plot"));
class PlotBoundary extends Component<{children:ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<WorkspaceNotice tone="attention">Chart unavailable. Exact values are below.</WorkspaceNotice>:this.props.children;}
}
function SeriesLabel({label,index}:{label:string;index:number}){
  return <span className="inline-flex items-center gap-2 break-words"><ReportSeriesMark index={index}/>{label}</span>;
}
function ReportExactValues({spec}:{spec:ReportChartSpec}){
  const label=spec.title+" exact values";
  if(spec.kind==="stacked"){
    if(!spec.rows.length)return null;
    return <Table scrollLabel={label} aria-label={label} className="print:text-xs">
      <TableCaption className="sr-only">{label}</TableCaption>
      <TableHeader><TableRow><TableHead scope="col">Category</TableHead>
        {spec.series.map((s,i)=><TableHead key={s.id} scope="col" className="text-right"><SeriesLabel label={s.label} index={i}/></TableHead>)}
        <TableHead scope="col" className="text-right">Total</TableHead></TableRow></TableHeader>
      <TableBody>{spec.rows.map(row=><TableRow key={row.id}><TableRowHead className="break-words">{row.label}</TableRowHead>
        {row.values.map((v,i)=><TableCell key={spec.series[i]!.id} className="text-right tabular-nums">{formatReportChartValue(v,spec.format)}</TableCell>)}
        <TableCell className="text-right tabular-nums">{formatReportChartValue(row.total,spec.format)}</TableCell></TableRow>)}</TableBody>
    </Table>;
  }
  if(!spec.points.length)return null;
  return <Table scrollLabel={label} aria-label={label} className="print:text-xs">
    <TableCaption className="sr-only">{label}</TableCaption>
    <TableHeader><TableRow><TableHead scope="col">Category</TableHead><TableHead scope="col" className="text-right">{spec.valueLabel}</TableHead></TableRow></TableHeader>
    <TableBody>{spec.points.map((p,i)=><TableRow key={p.id}>
      <TableRowHead className="break-words">{spec.kind==="distribution"?<SeriesLabel label={p.label} index={i}/>:p.label}</TableRowHead>
      <TableCell className="text-right tabular-nums">{formatReportChartValue(p.value,spec.format)}</TableCell>
    </TableRow>)}</TableBody>
  </Table>;
}
export type ReportPresentation="interactive"|"print";
/** V6.1 visualization composition. The plot is supplementary, never the only
 * route to values. Print presentation deliberately uses exact tables, not SVG.
 */
export function ReportChart({spec,presentation="interactive",headingLevel="h3"}:{
  spec:ReportChartSpec;presentation?:ReportPresentation;headingLevel?:"h2"|"h3"|"h4"|"h5"|"h6";
}){
  const valid=validateReportChart(spec);
  const categorical=spec.kind==="stacked"?spec.series:spec.kind==="distribution"?spec.points:null;
  return <div data-report-chart={spec.kind} className="min-w-0 print:break-inside-avoid">
    <DashboardPanel title={spec.title} description={spec.description} headingLevel={headingLevel}>
      <div className="min-w-0 space-y-4">
        {!valid?<WorkspaceNotice tone="attention">Invalid or unbounded chart data. Use the source report.</WorkspaceNotice>:<>
          {"population" in spec&&<p className="text-xs text-muted-foreground">Population: {spec.population}{spec.kind==="distribution"?". Total: "+formatReportChartValue(spec.total,spec.format):""}</p>}
          {hasReportChartValues(spec)?<>
            {presentation==="interactive"&&<div className="min-w-0 space-y-3 print:hidden">
              {categorical&&<ReportSeriesLegend items={categorical}/>}
              {hasNonzeroReportChartValues(spec)?<>
                <PlotBoundary key={spec.kind+":"+spec.title}>
                  <Suspense fallback={<QueryState loading="Loading chart… Exact values are below."/>}>
                    <ReportChartPlot spec={spec}/>
                  </Suspense>
                </PlotBoundary>
                {spec.kind!=="distribution"&&<p className="text-xs text-muted-foreground">Axis labels may be abbreviated. See full labels and values below.</p>}
              </>:<EmptyState title="All reported values are zero" description="No nonzero values to plot." className="p-4"/>}
            </div>}
          </>:<EmptyState title="No reported values available" description="Unavailable evidence is not a measured zero." className="p-4"/>}
          <ReportExactValues spec={spec}/>
        </>}
      </div>
    </DashboardPanel>
  </div>;
}

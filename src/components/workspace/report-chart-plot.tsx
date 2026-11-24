import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { formatReportChartValue, type ReportChartSpec } from "./report-chart-data";

import { reportSeriesColors } from "./report-chart-palette";
const margin={top:8,right:16,bottom:8,left:0};
export default function ReportChartPlot({spec}: {spec: ReportChartSpec}) {
  const axis = {fill:"var(--muted-foreground)",fontSize:11};
  const numberAxis = {tick:axis,tickFormatter:(n:number)=>formatReportChartValue(n,spec.format),
    allowDecimals:(spec.format ?? "count") !== "count"};
  if(spec.kind==="stacked"){
    const rows=spec.rows.map(row=>({label:row.label,...Object.fromEntries(row.values.map((v,i)=>["s"+i,v]))}));
    return <div aria-hidden="true" className="min-w-0 w-full">
      <ResponsiveContainer width="100%" height={Math.max(200,rows.length*42+42)} minWidth={0}>
        <BarChart data={rows} layout="vertical" accessibilityLayer={false} margin={margin}>
          <CartesianGrid stroke="var(--border)" horizontal={false}/>
          <XAxis type="number" domain={[0,"auto"]} {...numberAxis}/>
          <YAxis type="category" dataKey="label" tick={axis} width={120} interval={0}/>
          {spec.series.map((s,i)=><Bar key={s.id} dataKey={"s"+i} stackId="partition" fill={reportSeriesColors[i]} maxBarSize={24} isAnimationActive={false}/>)}
        </BarChart>
      </ResponsiveContainer>
    </div>;
  }
  const points=spec.points.map(p=>({...p}));
  if(spec.kind==="distribution"){
    if(spec.total===0)return <p className="text-sm text-muted-foreground">No nonzero values to plot.</p>;
    return <div aria-hidden="true" className="min-w-0 w-full">
      <ResponsiveContainer width="100%" height={220} minWidth={0}>
        <PieChart accessibilityLayer={false}>
          <Pie data={points} dataKey="value" nameKey="label" innerRadius="48%" outerRadius="82%" isAnimationActive={false}>
            {points.map((p,i)=><Cell key={p.id} fill={reportSeriesColors[i]} stroke="var(--card)"/>)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>;
  }
  return <div aria-hidden="true" className="min-w-0 w-full">
    <ResponsiveContainer width="100%" height={spec.kind !== "trend" ? Math.max(200,points.length*42+42) : 240} minWidth={0}>
      {spec.kind !== "trend"
        ? <BarChart data={points} layout="vertical" accessibilityLayer={false} margin={margin}>
            <CartesianGrid stroke="var(--border)" horizontal={false}/>
            <XAxis type="number" domain={[0,"auto"]} {...numberAxis}/>
            <YAxis type="category" dataKey="label" tick={axis} width={120} interval={0}/>
            <Bar dataKey="value" fill="var(--primary)" maxBarSize={24} isAnimationActive={false}/>
          </BarChart>
        : <LineChart data={points} accessibilityLayer={false} margin={margin}>
            <CartesianGrid stroke="var(--border)" vertical={false}/>
            <XAxis dataKey="label" tick={axis} minTickGap={20}/>
            <YAxis domain={[0,"auto"]} {...numberAxis}/>
            <Line dataKey="value" stroke="var(--primary)" strokeWidth={2} dot={{r:3}} connectNulls={false} isAnimationActive={false}/>
          </LineChart>}
    </ResponsiveContainer>
  </div>;
}

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { formatReportChartValue, type ReportChartSpec } from "./report-chart-data";

export default function ReportChartPlot({spec}: {spec: ReportChartSpec}) {
  const points = spec.points.map(p => ({...p}));
  const axis = {fill:"var(--muted-foreground)",fontSize:11};
  const numberAxis = {tick:axis,tickFormatter:(n:number)=>formatReportChartValue(n,spec.format),
    allowDecimals:(spec.format ?? "count") !== "count"};
  return <div aria-hidden="true" className="min-w-0 w-full">
    <ResponsiveContainer width="100%" height={spec.kind === "comparison" ? Math.max(200,points.length*42+42) : 240} minWidth={0}>
      {spec.kind === "comparison"
        ? <BarChart data={points} layout="vertical" accessibilityLayer={false} margin={{top:8,right:16,bottom:8,left:0}}>
            <CartesianGrid stroke="var(--border)" horizontal={false}/>
            <XAxis type="number" domain={[0,"auto"]} {...numberAxis}/>
            <YAxis type="category" dataKey="label" tick={axis} width={120} interval={0}/>
            <Bar dataKey="value" fill="var(--primary)" maxBarSize={24} isAnimationActive={false}/>
          </BarChart>
        : <LineChart data={points} accessibilityLayer={false} margin={{top:8,right:16,bottom:8,left:0}}>
            <CartesianGrid stroke="var(--border)" vertical={false}/>
            <XAxis dataKey="label" tick={axis} minTickGap={20}/>
            <YAxis domain={[0,"auto"]} {...numberAxis}/>
            <Line dataKey="value" stroke="var(--primary)" strokeWidth={2} dot={{r:3}} connectNulls={false} isAnimationActive={false}/>
          </LineChart>}
    </ResponsiveContainer>
  </div>;
}

import {useState} from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {formatReportAxisValue,reportChartLayout,truncateReportLabel,reportChartDomain,reportSeriesSlot,type ReportChartSpec} from "./report-chart-data";
import {reportSeriesColors,reportPlotStyle} from "./report-chart-palette";
import {ReportPatternDefinition,reportSeriesPaint,useReportPaintPrefix} from "./report-chart-marks";
import {ReportChartTooltip} from "./report-chart-tooltip";

const margin={top:8,right:12,bottom:8,left:0};
const axis={fill:reportPlotStyle.axisInk,fontSize:reportPlotStyle.axisFontSize,fontFamily:reportPlotStyle.axisFontFamily};
const axisGeometry={tick:axis,axisLine:false,tickLine:false,tickMargin:8};
const grid={stroke:reportPlotStyle.gridStroke,strokeDasharray:"3 3"};
const bar={maxBarSize:reportPlotStyle.barHeight,isAnimationActive:false} as const;

/** The ONLY Recharts runtime adapter. Domain data is already authorized and validated.
 * Plot geometry is not a feature option; exact values live in ReportChart's table.
 */
export default function ReportChartPlot({spec}: {spec: ReportChartSpec}){
  const [width,setWidth]=useState(320);
  const prefix=useReportPaintPrefix();
  const layout=reportChartLayout(width);
  const labels=new Map((spec.kind==="stacked"?spec.rows:spec.points).map(p=>[p.id,p.label]));
  const numberAxis={...axisGeometry,allowDataOverflow:spec.axisMax!==undefined||spec.format==="percent",tickFormatter:(n:number)=>formatReportAxisValue(n,spec.format),
    allowDecimals:(spec.format??"count")!=="count",tickCount:layout.tickCount};
  const domain=reportChartDomain(spec);
  const labelFor=(id:unknown)=>labels.get(String(id))??String(id??"");
  const categoryAxis={...axisGeometry,dataKey:"id",width:layout.categoryWidth,interval:0,
    tickFormatter:(id:unknown)=>truncateReportLabel(labelFor(id),layout.categoryLabelChars)};
  const resize=(nextWidth:number)=>setWidth(prior=>Math.round(nextWidth)===prior?prior:Math.round(nextWidth));
  const renderTooltip=({active,payload,label}:{active?:boolean;payload?:readonly {name?:unknown;value?:unknown}[];label?:unknown})=>{
    if(!active||!payload?.length)return null;
    const items=payload.map(entry=>({label:typeof entry.name==="string"?entry.name:spec.valueLabel,
      value:typeof entry.value==="number"&&Number.isFinite(entry.value)?entry.value:null}));
    return <ReportChartTooltip title={spec.kind==="distribution"?spec.title:labelFor(label)||spec.title} items={items} format={spec.format}/>;
  };
  const container={width:"100%" as const,minWidth:0,onResize:resize};
  if(spec.kind==="stacked"){
    const rows=spec.rows.map(row=>({id:row.id,...Object.fromEntries(row.values.map((v,i)=>["s"+i,v]))}));
    return <div aria-hidden="true" className="w-full min-w-0" data-report-chart-plot="stacked">
      <ResponsiveContainer {...container} height={Math.max(reportPlotStyle.minimumHeight,rows.length*reportPlotStyle.rowHeight+48)}>
        <BarChart data={rows} layout="vertical" accessibilityLayer={false} margin={margin}>
          <defs>{spec.series.map((s,i)=><ReportPatternDefinition key={s.id} prefix={prefix} index={reportSeriesSlot(spec,s.id,i)}/>)}</defs>
          <CartesianGrid {...grid} horizontal={false}/>
          <XAxis type="number" domain={domain} {...numberAxis}/>
          <YAxis type="category" {...categoryAxis}/>
          <Tooltip content={renderTooltip} cursor={{fill:reportPlotStyle.hover}} isAnimationActive={false}/>
          {spec.series.map((s,i)=><Bar key={s.id} dataKey={"s"+i} name={s.label} stackId="partition"
            fill={reportSeriesPaint(prefix,reportSeriesSlot(spec,s.id,i))} stroke={reportPlotStyle.separator} strokeWidth={1} {...bar}/>)}
        </BarChart>
      </ResponsiveContainer>
    </div>;
  }
  const points=spec.points.map(p=>({...p}));
  if(spec.kind==="distribution"){
    return <div aria-hidden="true" className="relative w-full min-w-0" data-report-chart-plot="distribution">
      <ResponsiveContainer {...container} height={reportPlotStyle.distributionHeight}>
        <PieChart accessibilityLayer={false}>
          <defs>{points.map((p,i)=><ReportPatternDefinition key={p.id} prefix={prefix} index={reportSeriesSlot(spec,p.id,i)}/>)}</defs>
          <Pie data={points} dataKey="value" nameKey="label" innerRadius="54%" outerRadius="83%" isAnimationActive={false}>
            {points.map((p,i)=><Cell key={p.id} fill={reportSeriesPaint(prefix,reportSeriesSlot(spec,p.id,i))} stroke={reportPlotStyle.separator} strokeWidth={2}/>)}
          </Pie>
          <Tooltip content={renderTooltip} cursor={false} isAnimationActive={false}/>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-foreground">
        <span className="font-sans text-2xl font-semibold tabular-nums">{formatReportAxisValue(spec.total,spec.format)}</span>
        <span className="text-xs text-muted-foreground">Total</span>
      </div>
    </div>;
  }
  return <div aria-hidden="true" className="w-full min-w-0" data-report-chart-plot={spec.kind}>
    <ResponsiveContainer {...container} height={spec.kind==="trend"?reportPlotStyle.trendHeight:Math.max(reportPlotStyle.minimumHeight,points.length*reportPlotStyle.rowHeight+48)}>
      {spec.kind!=="trend"
        ? <BarChart data={points} layout="vertical" accessibilityLayer={false} margin={margin}>
            <CartesianGrid {...grid} horizontal={false}/>
            <XAxis type="number" domain={domain} {...numberAxis}/>
            <YAxis type="category" {...categoryAxis}/>
            <Tooltip content={renderTooltip} cursor={{fill:reportPlotStyle.hover}} isAnimationActive={false}/>
            <Bar dataKey="value" name={spec.valueLabel} fill={reportSeriesColors[0]} {...bar}/>
          </BarChart>
        : <LineChart data={points} accessibilityLayer={false} margin={margin}>
            <CartesianGrid {...grid} vertical={false}/>
            <XAxis dataKey="id" {...axisGeometry} minTickGap={20} tickFormatter={(id:unknown)=>truncateReportLabel(labelFor(id),layout.trendLabelChars)}/>
            <YAxis domain={domain} width={layout.numberWidth} {...numberAxis}/>
            <Tooltip content={renderTooltip} cursor={{stroke:reportPlotStyle.gridStroke}} isAnimationActive={false}/>
            <Line dataKey="value" name={spec.valueLabel} stroke={reportSeriesColors[0]} strokeWidth={reportPlotStyle.lineWidth}
              dot={{r:reportPlotStyle.pointRadius,fill:reportSeriesColors[0],stroke:reportPlotStyle.separator,strokeWidth:1}}
              activeDot={{r:4,fill:reportSeriesColors[0],stroke:reportPlotStyle.separator,strokeWidth:1}}
              connectNulls={false} isAnimationActive={false}/>
          </LineChart>}
    </ResponsiveContainer>
  </div>;
}

import {StatCard} from "./stat-card";
import {compareReportCounts} from "@/domain/report-period-comparison";
import {formatReportChartValue} from "./report-chart-data";
export type ReportComparisonItem={id:string;label:string;value:number|null;prior?:number|null;hint?:string};
export function ReportMetricComparison({items,compare=false}:{items:readonly ReportComparisonItem[];compare?:boolean}){
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {items.map(item=>{
      const comparison=compare?compareReportCounts(item.value,item.prior):null;
      const change=comparison?.change;
      return <StatCard key={item.id} label={item.label} value={formatReportChartValue(item.value)}
        hint={<>{item.hint}{compare&&<span className="block mt-1">
          {comparison?"Prior "+formatReportChartValue(comparison.prior)+" · Change "+(change!>0?"+":"")+change!.toLocaleString("en-US"):"Prior comparison unavailable"}
        </span>}</>}/>;
    })}
  </div>;
}

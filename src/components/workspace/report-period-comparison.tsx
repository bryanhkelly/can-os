import {ReportMetricCard,type ReportMetricItem} from "./report-metric-card";
export type ReportComparisonItem=ReportMetricItem;
export function ReportMetricComparison({items,compare=false}:{items:readonly ReportComparisonItem[];compare?:boolean}){
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {items.map(item=><ReportMetricCard key={item.id} item={item} compare={compare}/>)}
  </div>;
}

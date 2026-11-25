import {reportValueComparison} from "./report-value-format";
/** Arithmetic presentation of two independently sourced counts, not a new domain metric. */
export function compareReportCounts(current:number|null|undefined,prior:number|null|undefined){
  const result=reportValueComparison(current,prior,"count");
  return result?{current:result.current,prior:result.prior,change:result.change}:null;
}

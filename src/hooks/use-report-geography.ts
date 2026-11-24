import {usePrivateReportQuery} from "@/hooks/use-private-report-query";
import {getReportingGeographyOptions} from "@/modules/geography/reporting-geography.functions";
export function useReportGeography(scope:string|null,basis:"current"|"historical"){
 return usePrivateReportQuery({scope,key:["geography-options",basis],
  read:()=>getReportingGeographyOptions({data:{basis}})});
}

import { reportingCsvRow, type ReportingCsvValue } from "@/domain/reporting-csv";
import { downloadBlob } from "./download";

/** Browser transport only. The report owner supplies already authorized, minimized rows. */
export function downloadReportingCsv(rows:readonly (readonly ReportingCsvValue[])[],filename:string):void{
  downloadBlob(new Blob([rows.map(reportingCsvRow).join("\r\n")],{type:"text/csv;charset=utf-8"}),filename);
}

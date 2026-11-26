import {createServerFn} from "@tanstack/react-start";
import {setResponseHeader} from "@tanstack/react-start/server";
import {z} from "zod";
import {db} from "@/db/client";
import {requireOperatorReportingScope} from "@/modules/reporting/operator-reporting-scope.server";
import {listScopedGeographyOptions} from "./reporting-geography.server";
export const getReportingGeographyOptions=createServerFn({method:"GET"})
 .validator((value:unknown)=>z.object({basis:z.enum(["current","historical"])}).strict().parse(value))
 .handler(async({data})=>{
  setResponseHeader("Cache-Control","private, no-store");
  const provider=await requireOperatorReportingScope();
  return listScopedGeographyOptions(db,provider,data.basis,new Date());
 });

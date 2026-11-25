import {createServerFn} from "@tanstack/react-start";
import {setResponseHeader} from "@tanstack/react-start/server";
import {z} from "zod";
import {db} from "@/db/client";
import {requireCanonicalLabProvider} from "@/modules/operations/canonical-capability-lab-access.server";
import {listScopedGeographyOptions} from "./reporting-geography.server";
export const getReportingGeographyOptions=createServerFn({method:"GET"})
 .validator((value:unknown)=>z.object({basis:z.enum(["current","historical"])}).strict().parse(value))
 .handler(async({data})=>{
  setResponseHeader("Cache-Control","private, no-store");
  const provider=await requireCanonicalLabProvider("noncredit.enrollment.read");
  return listScopedGeographyOptions(db,provider,data.basis,new Date());
 });

import { createFileRoute } from "@tanstack/react-router";
import { processSchoolFamilyOutboundDeliveries } from "@/modules/communication/school-family-alert-delivery.server";
import { isAuthorizedJobRequest } from "@/lib/job-auth.server";

/** Independent fast-path for urgent school-to-family delivery.
 * The existing five-minute general maintenance job remains a fallback.
 * No sender credentials or access to school records are exposed publicly.
 */
export const Route=createFileRoute("/api/school-family-deliveries")({
 server:{handlers:{
  POST:async({request})=>{
   if(!isAuthorizedJobRequest(request))
    return Response.json({error:"Unauthorized"},{status:401});
   const accepted=await processSchoolFamilyOutboundDeliveries();
   return Response.json({accepted});
  },
 }},
});

import { createFileRoute } from "@tanstack/react-router";
import { processSchoolFamilyOutboundDeliveries } from "@/modules/communication/school-family-alert-delivery.server";

/** Dedicated, authenticated urgent-family dispatch. The existing general
 * maintenance job remains a fallback; row leases prevent duplicate claims.
 */
export const Route=createFileRoute("/api/family-alert-delivery")({
 server:{handlers:{
  POST:async({request})=>{
   const secret=process.env.CAN_JOB_SECRET;
   if(!secret||request.headers.get("x-can-job-secret")!==secret)
     return Response.json({error:"Unauthorized"},{status:401});
   const accepted=await processSchoolFamilyOutboundDeliveries();
   return Response.json({accepted});
  },
 }},
});

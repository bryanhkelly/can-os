import {createFileRoute} from "@tanstack/react-router";
import {createServerOnlyFn} from "@tanstack/react-start";
export const Route=createFileRoute("/access/request")({
 server:{handlers:{
  POST:createServerOnlyFn(async({request})=>{
   const {handleAccessRequest}=await import("@/modules/identity/access-http.server");
   return handleAccessRequest(request);
  }),
 }},
});

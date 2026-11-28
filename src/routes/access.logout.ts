import {createFileRoute} from "@tanstack/react-router";
export const Route=createFileRoute("/access/logout")({
 server:{handlers:{
  POST:async({request})=>{
   const {handleAccessLogout}=await import("@/modules/identity/access-http.server");
   return handleAccessLogout(request);
  },
 }},
});

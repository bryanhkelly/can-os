import {createFileRoute} from "@tanstack/react-router";
import {handlePublicGo} from "@/modules/engagement/go-public-http.server";
export const Route=createFileRoute("/go/$code")({server:{handlers:{
 GET:({params,request})=>handlePublicGo(request,params.code),
}}});

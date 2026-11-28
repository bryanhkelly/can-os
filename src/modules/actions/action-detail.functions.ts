import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {z} from "zod";
export const getActionDetail=createServerFn({method:"GET"}).validator((value:unknown)=>z.object({actionId:z.string().uuid()}).strict().parse(value)).handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");const {getActionDetailService}=await import("./action-detail.server");return getActionDetailService(getRequest(),data);});

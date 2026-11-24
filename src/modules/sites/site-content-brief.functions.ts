import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {z} from "zod";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {readAuthorizedSiteContentBrief} from "./site-content-brief.server";
export const readSiteContentBriefV61=createServerFn({method:"GET"})
  .validator((value:unknown)=>z.object({siteId:z.string().uuid()}).strict().parse(value))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    return readAuthorizedSiteContentBrief(await getCommandContext(getRequest()),data.siteId);
  });

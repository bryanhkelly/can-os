import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {z} from "zod";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {siteMediaUploadSchema,siteMediaReviewSchema,siteMediaRevokeSchema}
  from "@/domain/site-media-folder";
import {beginSiteMediaFolderUpload,finishSiteMediaFolderUpload,
  listSiteMediaFolder,reviewSiteMediaFolder,revokeSiteMediaFolder}
  from "./site-media-folder.server";

export const beginSchoolSiteMediaUpload=createServerFn({method:"POST"})
  .validator((raw:unknown)=>siteMediaUploadSchema.parse(raw))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCommandContext(getRequest());
    return beginSiteMediaFolderUpload(actor,data);
  });

export const finishSchoolSiteMediaUpload=createServerFn({method:"POST"})
  .validator((raw:unknown)=>siteMediaUploadSchema.extend({
    key:z.string().regex(/^school-site-media\/[a-f0-9-]{36}\/[a-f0-9-]{36}$/i),
  }).parse(raw))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCommandContext(getRequest());
    return finishSiteMediaFolderUpload(actor,data);
  });

export const listSchoolSiteMedia=createServerFn({method:"GET"})
  .validator((raw:unknown)=>z.object({siteId:z.string().uuid()}).strict().parse(raw))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCommandContext(getRequest());
    return listSiteMediaFolder(actor,data.siteId);
  });

export const approveSchoolSiteMediaFolder=createServerFn({method:"POST"})
  .validator((raw:unknown)=>siteMediaReviewSchema.parse(raw))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCommandContext(getRequest());
    return reviewSiteMediaFolder(actor,data);
  });

export const revokeSchoolSiteMediaFolder=createServerFn({method:"POST"})
  .validator((raw:unknown)=>siteMediaRevokeSchema.parse(raw))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCommandContext(getRequest());
    return revokeSiteMediaFolder(actor,data);
  });

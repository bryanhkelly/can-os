import {z} from "zod";
import {parseCommandInput} from "@/domain/command-input";
import {mutationSchema} from "./site-brand.schemas";
import {readSiteBrandVersionViewServer,saveSiteBrandVersionServer,revokeSiteBrandAssetServer} from "./site-brand.server";
export async function readSiteBrandHttp(request:Request,raw:unknown){
 return readSiteBrandVersionViewServer(request,parseCommandInput(z.object({siteId:z.string().uuid(),versionId:z.string().uuid().optional()}).strict(),raw));
}
export async function saveSiteBrandHttp(request:Request,raw:unknown){
 return saveSiteBrandVersionServer(request,parseCommandInput(mutationSchema,raw));
}
export async function revokeSiteBrandAssetHttp(request:Request,raw:unknown){
 return revokeSiteBrandAssetServer(request,parseCommandInput(z.object({siteId:z.string().uuid(),assetId:z.string().uuid(),reason:z.string().trim().min(8).max(500)}).strict(),raw));
}

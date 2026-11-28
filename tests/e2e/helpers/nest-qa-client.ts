import {expect,request,type APIRequestContext} from "@playwright/test";
import {z} from "zod";
import {authenticateQaActor,qaSession} from "./pilot-standard-access";
export const uuid=z.string().uuid();
export const origin="http://localhost:3001",api=origin+"/api/v1";
export const actorSchema=z.object({email:z.string().email().refine(v=>v===v.toLowerCase()&&v.endsWith(".test")),grantId:uuid,personId:uuid,organizationId:uuid.nullable(),siteId:uuid.nullable()}).strict();
export type Actor=z.infer<typeof actorSchema>;
export class NestQaClient {
 private constructor(readonly http:APIRequestContext){}
 static async create(){return new NestQaClient(await request.newContext());}
 async login(actor:Actor){
  const initial=await authenticateQaActor({request:this.http},actor.email,undefined,"nest");
  expect(initial.grants.find(g=>g.id===actor.grantId)).toMatchObject({personId:actor.personId,organizationId:actor.organizationId,siteId:actor.siteId});
  await this.post("/me/session/membership",{grantId:actor.grantId},204);
  expect((await qaSession({request:this.http},"nest")).activeGrantId).toBe(actor.grantId);
 }
 private target(path:string){
  if(!path.startsWith("/")||path.startsWith("//")||path.includes("://"))throw Error("Only ordinary local API paths are allowed");
  return api+path;
 }
 async get<T=unknown>(path:string,status=200):Promise<T>{
  const response=await this.http.get(this.target(path),{maxRedirects:0,timeout:30000});
  expect(response.status(),"GET "+path.split("?")[0]).toBe(status);
  return (status===204?undefined:await response.json()) as T;
 }
 async post<T=unknown>(path:string,data:unknown,status=200):Promise<T>{
  const response=await this.http.post(this.target(path),{headers:{Origin:origin},data,maxRedirects:0,timeout:30000});
  expect(response.status(),"POST "+path).toBe(status);
  return (status===204?undefined:await response.json()) as T;
 }
 async deny(method:"GET"|"POST",path:string,data?:unknown,allowed:readonly number[]=[403]){
  const response=method==="GET"?await this.http.get(this.target(path),{maxRedirects:0}):await this.http.post(this.target(path),{headers:{Origin:origin},data,maxRedirects:0});
  expect(allowed,method+" "+path.split("?")[0]+" denial").toContain(response.status());
  expect(response.headers()["content-type"]).toContain("application/problem+json");
  const problem=await response.json();
  expect(problem.status).toBe(response.status());
  expect(problem.requestId).toBe(response.headers()["x-request-id"]);
 }
 async logout(){await this.post("/access/logout",{},204);await this.deny("GET","/access/session",undefined,[401]);}
 async close(){await this.http.dispose();}
}
export function query(path:string,params:Record<string,string>){return path+"?"+new URLSearchParams(params);}

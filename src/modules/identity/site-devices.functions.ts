import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {and,desc,eq} from "drizzle-orm";
import {z} from "zod";
import {db} from "@/db/client";
import {siteDeviceRegistrations,siteDevicePolicies} from "@/db/canonical-v301";
import {getCanonicalCommandContext} from "@/modules/identity/canonical-command-context.server";
import {AuthorizationError} from "@/domain/command-context";
const category=z.enum(["desktop","laptop","tablet","phone","chromebook","other"]);
const ownership=z.enum(["site","organization","loaned","personal"]);
const status=z.enum(["active","repair","retired","lost"]);
const registration=z.object({
 label:z.string().trim().min(2).max(100),deviceCategory:category,
 ownership,managed:z.boolean(),
}).strict();
const policyUpdate=z.object({
 sharedDeviceRequired:z.boolean(),
 managedDeviceRequiredForAssessments:z.boolean(),
 kioskIdleMinutes:z.number().int().min(1).max(30),
}).strict();
const update=z.object({id:z.string().uuid(),status}).strict();
async function authorizedSite(write:boolean){
 const actor=await getCanonicalCommandContext(getRequest());
 if(!actor.actorPersonId || (write?actor.role!=="site_admin":!["site_admin","registrar"].includes(actor.role??"")))
  throw new AuthorizationError("current Site device administration");
 const sites=actor.scope.siteIds??[];
 if(sites.length!==1||(actor.scope.organizationIds??[]).length!==1)
  throw new AuthorizationError("one authorized Site");
 return {siteId:sites[0]!,writeAllowed:actor.role==="site_admin"};
}
function privateResponse(){setResponseHeader("Cache-Control","private, no-store");}
export const getSiteDeviceWorkspace=createServerFn({method:"GET"}).handler(async()=>{
 privateResponse();
 const {siteId,writeAllowed}=await authorizedSite(false);
 const [registered,policies]=await Promise.all([
  db.select({
   id:siteDeviceRegistrations.id,label:siteDeviceRegistrations.label,
   deviceCategory:siteDeviceRegistrations.deviceCategory,ownership:siteDeviceRegistrations.ownership,
   managed:siteDeviceRegistrations.managed,status:siteDeviceRegistrations.status,
   enrolledAt:siteDeviceRegistrations.enrolledAt,
  }).from(siteDeviceRegistrations)
    .where(eq(siteDeviceRegistrations.siteId,siteId))
    .orderBy(desc(siteDeviceRegistrations.enrolledAt)).limit(100),
  db.select().from(siteDevicePolicies).where(eq(siteDevicePolicies.siteId,siteId)).limit(1),
 ]);
 return {siteId,writeAllowed,
  devices:registered.map(d=>({...d,enrolledAt:d.enrolledAt.toISOString()})),
  policy:policies[0]?{
   sharedDeviceRequired:policies[0].sharedDeviceRequired,
   managedDeviceRequiredForAssessments:policies[0].managedDeviceRequiredForAssessments,
   kioskIdleMinutes:policies[0].kioskIdleMinutes,
  }:{sharedDeviceRequired:false,managedDeviceRequiredForAssessments:false,kioskIdleMinutes:5},
 };
});
export const createSiteDeviceRegistration=createServerFn({method:"POST"})
.validator((input:unknown)=>registration.parse(input)).handler(async({data})=>{
 privateResponse();
 const {siteId}=await authorizedSite(true);
 const [created]=await db.insert(siteDeviceRegistrations).values({...data,siteId})
  .returning({id:siteDeviceRegistrations.id});
 if(!created)throw new Error("Unable to register device");
 return {id:created.id};
});
export const changeSiteDeviceStatus=createServerFn({method:"POST"})
.validator((input:unknown)=>update.parse(input)).handler(async({data})=>{
 privateResponse();
 const {siteId}=await authorizedSite(true);
 const [saved]=await db.update(siteDeviceRegistrations).set({status:data.status})
 .where(and(eq(siteDeviceRegistrations.id,data.id),eq(siteDeviceRegistrations.siteId,siteId)))
 .returning({id:siteDeviceRegistrations.id});
 if(!saved)throw new AuthorizationError("Site-owned device record");
 return {id:saved.id};
});
export const updateSiteDevicePolicy=createServerFn({method:"POST"})
.validator((input:unknown)=>policyUpdate.parse(input)).handler(async({data})=>{
 privateResponse();
 const {siteId}=await authorizedSite(true);
 await db.insert(siteDevicePolicies).values({...data,siteId}).onConflictDoUpdate({
  target:siteDevicePolicies.siteId,
  set:{...data,updatedAt:new Date()},
 });
 return {saved:true};
});

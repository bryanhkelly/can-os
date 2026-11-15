import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {and,desc,eq} from "drizzle-orm";
import {z} from "zod";
import {db} from "@/db/client";
import {siteDeviceRegistrations,siteDevicePolicies,auditEvents} from "@/db/canonical-v301";
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
 return {siteId:sites[0]!,organizationId:actor.scope.organizationIds![0]!,actorPersonId:actor.actorPersonId!,writeAllowed:actor.role==="site_admin"};
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
 const {siteId,organizationId,actorPersonId}=await authorizedSite(true);
 return db.transaction(async tx=>{
  const [created]=await tx.insert(siteDeviceRegistrations).values({...data,siteId})
   .returning({id:siteDeviceRegistrations.id});
  if(!created)throw new Error("Unable to register device");
  await tx.insert(auditEvents).values({
   actorPersonId,owningOrganizationId:organizationId,
   eventCode:"site_device.registered",entityKind:"site_device_registration",
   entityId:created.id,payload:{siteId,deviceCategory:data.deviceCategory,ownership:data.ownership,managed:data.managed}
  });
  return {id:created.id};
 });
});
export const changeSiteDeviceStatus=createServerFn({method:"POST"})
.validator((input:unknown)=>update.parse(input)).handler(async({data})=>{
 privateResponse();
 const {siteId,organizationId,actorPersonId}=await authorizedSite(true);
 return db.transaction(async tx=>{
  const [previous]=await tx.select({status:siteDeviceRegistrations.status})
    .from(siteDeviceRegistrations)
    .where(and(eq(siteDeviceRegistrations.id,data.id),eq(siteDeviceRegistrations.siteId,siteId)))
    .limit(1).for("update");
  if(!previous)throw new AuthorizationError("Site-owned device record");
  if(previous.status===data.status)return {id:data.id};
  const [saved]=await tx.update(siteDeviceRegistrations).set({status:data.status})
   .where(and(eq(siteDeviceRegistrations.id,data.id),eq(siteDeviceRegistrations.siteId,siteId)))
   .returning({id:siteDeviceRegistrations.id});
  if(!saved)throw new AuthorizationError("Site-owned device record");
  await tx.insert(auditEvents).values({
   actorPersonId,owningOrganizationId:organizationId,
   eventCode:"site_device.status_changed",entityKind:"site_device_registration",
   entityId:data.id,payload:{siteId,previousStatus:previous.status,newStatus:data.status}
  });
  return {id:saved.id};
 });
});
export const updateSiteDevicePolicy=createServerFn({method:"POST"})
.validator((input:unknown)=>policyUpdate.parse(input)).handler(async({data})=>{
 privateResponse();
 const {siteId,organizationId,actorPersonId}=await authorizedSite(true);
 return db.transaction(async tx=>{
  const [previous]=await tx.select().from(siteDevicePolicies)
   .where(eq(siteDevicePolicies.siteId,siteId)).limit(1).for("update");
  if(previous&&previous.sharedDeviceRequired===data.sharedDeviceRequired&&
   previous.managedDeviceRequiredForAssessments===data.managedDeviceRequiredForAssessments&&
   previous.kioskIdleMinutes===data.kioskIdleMinutes)return {saved:true};
  await tx.insert(siteDevicePolicies).values({...data,siteId}).onConflictDoUpdate({
   target:siteDevicePolicies.siteId,
   set:{...data,updatedAt:new Date()},
  });
  await tx.insert(auditEvents).values({
   actorPersonId,owningOrganizationId:organizationId,
   eventCode:"site_device.policy_updated",entityKind:"site_device_policy",
   entityId:siteId,payload:{
    siteId,sharedDeviceRequired:data.sharedDeviceRequired,
    managedDeviceRequiredForAssessments:data.managedDeviceRequiredForAssessments,
    kioskIdleMinutes:data.kioskIdleMinutes
   }
  });
  return {saved:true};
 });
});

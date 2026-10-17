import {createServerFn} from "@tanstack/react-start";
import {setResponseHeader} from "@tanstack/react-start/server";
import {and,desc,eq} from "drizzle-orm";
import {z} from "zod";
import {assertSyntheticMutation} from "@/modules/_demo/demo-write-gate";
import {requireActor} from "@/modules/identity/actors.server";
export const getSyntheticTeacherNotices=createServerFn({method:"GET"}).handler(async()=>{
 const actor=await requireActor(["teacher"]);
 setResponseHeader("Cache-Control","private, no-store");
 if(!process.env.DATABASE_URL)return {connected:false,items:[]};
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const notices=await db.select({id:s.notifications.id,title:s.notifications.title,body:s.notifications.body,status:s.notifications.status,resourceId:s.notifications.resourceId,createdAt:s.notifications.createdAt})
  .from(s.notifications).where(and(eq(s.notifications.recipientPersonId,actor.actorPersonId),eq(s.notifications.type,"operations_action_assigned"))).orderBy(desc(s.notifications.createdAt)).limit(50);
 return {connected:true,items:notices.map(n=>({...n,createdAt:n.createdAt.toISOString()}))};
});
export const acknowledgeSyntheticTeacherNotice=createServerFn({method:"POST"})
 .validator((data:unknown)=>z.object({id:z.string().uuid()}).parse(data)).handler(async({data})=>{
  assertSyntheticMutation("teacher");
  const actor=await requireActor(["teacher"]);
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  const rows=await db.update(s.notifications).set({status:"read",readAt:new Date(),updatedAt:new Date()})
   .where(and(eq(s.notifications.id,data.id),eq(s.notifications.recipientPersonId,actor.actorPersonId),eq(s.notifications.type,"operations_action_assigned")))
   .returning({id:s.notifications.id});
  if(!rows.length)throw new Error("Teacher notice not found");
  return {saved:true};
 });

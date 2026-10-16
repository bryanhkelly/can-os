import {createServerFn} from "@tanstack/react-start";
import {and,desc,eq} from "drizzle-orm";
import {assertSyntheticMutation} from "./demo-write-gate";
const TEACHER="f1000000-0000-4000-8000-000000000006";
export const getSyntheticTeacherNotices=createServerFn({method:"GET"}).handler(async()=>{
 if(!process.env.DATABASE_URL)return {connected:false,items:[]};
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const notices=await db.select({id:s.notifications.id,title:s.notifications.title,body:s.notifications.body,status:s.notifications.status,resourceId:s.notifications.resourceId,createdAt:s.notifications.createdAt})
  .from(s.notifications).where(and(eq(s.notifications.recipientPersonId,TEACHER),eq(s.notifications.type,"operations_action_assigned"))).orderBy(desc(s.notifications.createdAt)).limit(50);
 return {connected:true,items:notices.map(n=>({...n,createdAt:n.createdAt.toISOString()}))};
});
export const acknowledgeSyntheticTeacherNotice=createServerFn({method:"POST"})
 .validator((data:{id:string})=>data).handler(async({data})=>{
  assertSyntheticMutation("teacher");
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  const rows=await db.update(s.notifications).set({status:"read",readAt:new Date(),updatedAt:new Date()})
   .where(and(eq(s.notifications.id,data.id),eq(s.notifications.recipientPersonId,TEACHER),eq(s.notifications.type,"operations_action_assigned")))
   .returning({id:s.notifications.id});
  if(!rows.length)throw new Error("Teacher notice not found");
  return {saved:true};
 });

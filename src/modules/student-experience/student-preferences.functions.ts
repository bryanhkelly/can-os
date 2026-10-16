import {createServerFn} from "@tanstack/react-start";
import {eq} from "drizzle-orm";
import {assertSyntheticMutation} from "@/modules/student-experience/demo-write-gate";
import {parseStudentDisplayPreferences,studentDisplayPreferences} from "@/domain/student-display-preferences";
import {recordAudit,requireActor} from "@/modules/identity/actors.server";
export const getSyntheticStudentPreferences=createServerFn({method:"GET"}).handler(async()=>{
 const actor=await requireActor(["student"]);
 if(!process.env.DATABASE_URL)return parseStudentDisplayPreferences({});
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const [person]=await db.select({metadata:s.people.metadata}).from(s.people).where(eq(s.people.id,actor.actorPersonId)).limit(1);
 return parseStudentDisplayPreferences(person?.metadata?.studentDisplayPreferences);
});
export const saveSyntheticStudentPreferences=createServerFn({method:"POST"})
 .validator((input:unknown)=>studentDisplayPreferences.parse(input))
 .handler(async({data})=>{
  assertSyntheticMutation("student");
  const actor=await requireActor(["student"]);
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  return db.transaction(async tx=>{
   const [person]=await tx.select({metadata:s.people.metadata}).from(s.people).where(eq(s.people.id,actor.actorPersonId)).for("update").limit(1);
   if(!person)throw new Error("Person unavailable");
   await tx.update(s.people).set({metadata:{...person.metadata,studentDisplayPreferences:data},updatedAt:new Date()}).where(eq(s.people.id,actor.actorPersonId));
   await recordAudit(tx,actor,{action:"student.preferences.save",resourceType:"person",resourceId:actor.actorPersonId,before:{preferences:person.metadata?.studentDisplayPreferences??null},after:{preferences:data}});
   return {saved:true,preferences:data};
  });
 });

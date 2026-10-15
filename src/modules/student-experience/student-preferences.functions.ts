import {createServerFn} from "@tanstack/react-start";
import {eq} from "drizzle-orm";
import {assertSyntheticMutation} from "@/modules/student-experience/demo-write-gate";
import {parseStudentDisplayPreferences,studentDisplayPreferences} from "@/domain/student-display-preferences";
const DEMO_STUDENT="f1000000-0000-4000-8000-000000000005";
export const getSyntheticStudentPreferences=createServerFn({method:"GET"}).handler(async()=>{
 if(!process.env.DATABASE_URL)return parseStudentDisplayPreferences({});
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const [person]=await db.select({metadata:s.people.metadata}).from(s.people).where(eq(s.people.id,DEMO_STUDENT)).limit(1);
 return parseStudentDisplayPreferences(person?.metadata?.studentDisplayPreferences);
});
export const saveSyntheticStudentPreferences=createServerFn({method:"POST"})
 .validator((input:unknown)=>studentDisplayPreferences.parse(input))
 .handler(async({data})=>{
  assertSyntheticMutation("student");
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  return db.transaction(async tx=>{
   const [person]=await tx.select({metadata:s.people.metadata}).from(s.people).where(eq(s.people.id,DEMO_STUDENT)).for("update").limit(1);
   if(!person)throw new Error("Synthetic person unavailable");
   await tx.update(s.people).set({metadata:{...person.metadata,studentDisplayPreferences:data},updatedAt:new Date()}).where(eq(s.people.id,DEMO_STUDENT));
   return {saved:true,preferences:data};
  });
 });

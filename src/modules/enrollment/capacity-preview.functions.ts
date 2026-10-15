import {createServerFn} from "@tanstack/react-start";
import {eq,inArray} from "drizzle-orm";
import {assessAdmissionsCapacity,readCapacityPolicy} from "@/domain/admissions-capacity";
export const getSyntheticAdmissionsCapacity=createServerFn({method:"GET"}).handler(async()=>{
 if(!process.env.DATABASE_URL)return [];
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const programs=await db.select({id:s.programs.id,name:s.programs.name,metadata:s.programs.metadata}).from(s.programs).limit(100);
 const synthetic=programs.filter(p=>p.metadata.synthetic===true);
 if(!synthetic.length)return [];
 const ids=synthetic.map(p=>p.id);
 const apps=await db.select({programId:s.applications.programId,stage:s.applications.stage,metadata:s.applications.metadata}).from(s.applications).where(inArray(s.applications.programId,ids));
 const enrollments=await db.select({programId:s.enrollments.programId,studentId:s.enrollments.studentProfileId,status:s.enrollments.status,kind:s.enrollments.kind}).from(s.enrollments).where(inArray(s.enrollments.programId,ids));
 return synthetic.map(program=>{
  const active=new Set(enrollments.filter(e=>e.programId===program.id&&e.kind==="program"&&e.status==="active").map(e=>e.studentId));
  const offered=apps.filter(a=>a.programId===program.id&&a.metadata.synthetic===true&&a.stage==="accepted").length;
  return {id:program.id,name:program.name,...assessAdmissionsCapacity(readCapacityPolicy(program.metadata),active.size,offered)};
 });
});

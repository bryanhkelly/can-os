import {createServerFn} from "@tanstack/react-start";
import {and,eq,inArray} from "drizzle-orm";
import {assertSyntheticMutation} from "@/modules/_demo/demo-write-gate";
import {z} from "zod";
import {assertProgramGranted,recordAudit,requireActor} from "@/modules/identity/actors.server";

/** Counts actual active enrollments and unexpired held offers by school year. */
export const getSyntheticAdmissionsCapacity=createServerFn({method:"GET"}).handler(async()=>{
 const actor=await requireActor(["registrar"],"enrollment.decide");
 const granted=actor.scope.programIds??[];
 if(!granted.length)return [];
 if(!process.env.DATABASE_URL)return [];
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const programs=await db.select({id:s.programs.id,name:s.programs.name,metadata:s.programs.metadata}).from(s.programs).where(inArray(s.programs.id,granted)).limit(100);
 const synthetic=programs.filter(p=>p.metadata.synthetic===true);
 if(!synthetic.length)return [];
 const ids=synthetic.map(p=>p.id);
 const pools=await db.select({id:s.admissionSeatPools.id,programId:s.admissionSeatPools.programId,schoolYearId:s.admissionSeatPools.schoolYearId,capacity:s.admissionSeatPools.capacity,yearName:s.schoolYears.name}).from(s.admissionSeatPools).innerJoin(s.schoolYears,eq(s.schoolYears.id,s.admissionSeatPools.schoolYearId)).where(inArray(s.admissionSeatPools.programId,ids));
 const enrollments=await db.select({programId:s.enrollments.programId,schoolYearId:s.enrollments.schoolYearId,studentId:s.enrollments.studentProfileId}).from(s.enrollments).where(and(inArray(s.enrollments.programId,ids),eq(s.enrollments.kind,"program"),eq(s.enrollments.status,"active")));
 const offers=await db.select({programId:s.admissionOffers.programId,schoolYearId:s.admissionOffers.schoolYearId,status:s.admissionOffers.status,expiresAt:s.admissionOffers.expiresAt,studentId:s.applications.studentProfileId}).from(s.admissionOffers).innerJoin(s.applications,eq(s.applications.id,s.admissionOffers.applicationId)).where(inArray(s.admissionOffers.programId,ids));
 return pools.map(pool=>{
  const enrolled=new Set(enrollments.filter(e=>e.programId===pool.programId&&e.schoolYearId===pool.schoolYearId).map(e=>e.studentId));
  const reservations=new Set(offers.filter(o=>o.programId===pool.programId&&o.schoolYearId===pool.schoolYearId&&!enrolled.has(o.studentId)&&(o.status==="accepted"||(o.status==="issued"&&(!o.expiresAt||o.expiresAt.getTime()>Date.now())))).map(o=>o.studentId)).size;
  const occupied=enrolled.size+reservations;
  return {id:pool.id,programId:pool.programId,name:synthetic.find(p=>p.id===pool.programId)?.name??"Program",yearName:pool.yearName,capacity:pool.capacity,enrolled:enrolled.size,offered:reservations,remaining:Math.max(0,pool.capacity-occupied),status:occupied>=pool.capacity?"full":"available"};
 });
});

/** Synthetic-only capacity adjustment; never reduces below occupied/held seats. */
export const updateSyntheticAdmissionsCapacity=createServerFn({method:"POST"})
 .validator((data:unknown)=>z.object({poolId:z.string().uuid(),capacity:z.number().int("Capacity must be a positive whole number").min(1,"Capacity must be a positive whole number").max(100000,"Capacity must be a positive whole number")}).parse(data))
 .handler(async({data})=>{
  assertSyntheticMutation("registrar");
  const actor=await requireActor(["registrar"],"enrollment.decide");
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  return db.transaction(async tx=>{
   const [pool]=await tx.select().from(s.admissionSeatPools).where(eq(s.admissionSeatPools.id,data.poolId)).for("update").limit(1);
   if(!pool)throw new Error("Seat pool not found");
   assertProgramGranted(actor,pool.programId);
   const [program]=await tx.select({metadata:s.programs.metadata}).from(s.programs).where(eq(s.programs.id,pool.programId)).limit(1);
   if(!program||program.metadata.synthetic!==true)throw new Error("Only synthetic capacity can be adjusted");
   const active=await tx.select({studentId:s.enrollments.studentProfileId}).from(s.enrollments).where(and(eq(s.enrollments.programId,pool.programId),eq(s.enrollments.schoolYearId,pool.schoolYearId),eq(s.enrollments.kind,"program"),eq(s.enrollments.status,"active")));
   const students=new Set(active.map(e=>e.studentId));
   const offers=await tx.select({studentId:s.applications.studentProfileId,status:s.admissionOffers.status,expiresAt:s.admissionOffers.expiresAt}).from(s.admissionOffers).innerJoin(s.applications,eq(s.applications.id,s.admissionOffers.applicationId)).where(and(eq(s.admissionOffers.programId,pool.programId),eq(s.admissionOffers.schoolYearId,pool.schoolYearId)));
   const reserved=new Set(offers.filter(o=>!students.has(o.studentId)&&(o.status==="accepted"||(o.status==="issued"&&(!o.expiresAt||o.expiresAt.getTime()>Date.now())))).map(o=>o.studentId)).size;
   if(data.capacity<students.size+reserved)throw new Error("Cannot reduce capacity below active enrollments and held offers");
   if(pool.capacity===data.capacity)return {saved:true};
   await tx.update(s.admissionSeatPools).set({capacity:data.capacity,updatedAt:new Date()}).where(eq(s.admissionSeatPools.id,pool.id));
   await recordAudit(tx,actor,{action:"admissions.capacity.update",resourceType:"admission_seat_pool",resourceId:pool.id,before:{capacity:pool.capacity},after:{capacity:data.capacity},scope:{programId:pool.programId,schoolYearId:pool.schoolYearId}});
   return {saved:true};
  });
 });

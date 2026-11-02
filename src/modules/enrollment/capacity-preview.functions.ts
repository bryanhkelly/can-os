import {createServerFn} from "@tanstack/react-start";
import {and,eq,inArray} from "drizzle-orm";
import {z} from "zod";
import {assertProgramGranted,recordAudit,requireActor} from "@/modules/identity/actors.server";
import {operationsSelectionSchema,resolveOperationsSelection} from "@/modules/operations/operations-scope.server";
import {schoolYearServesProgram} from "@/domain/family-application-handoff";

/** Counts actual active enrollments and unexpired held offers by school year. */
export const getAdmissionsCapacity=createServerFn({method:"GET"})
 .validator((input:unknown)=>operationsSelectionSchema.parse(input??{}))
 .handler(async({data})=>{
 const actor=await requireActor(["registrar"],"enrollment.decide");
 const scoped=await resolveOperationsSelection(actor,data);
 const granted=scoped.programIds;
 if(!granted.length)return [];
 if(!process.env.DATABASE_URL)return [];
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const programs=await db.select({id:s.programs.id,name:s.programs.name}).from(s.programs).where(inArray(s.programs.id,granted)).limit(100);
 if(!programs.length)return [];
 const ids=programs.map(p=>p.id);
 const pools=await db.select({id:s.admissionSeatPools.id,programId:s.admissionSeatPools.programId,schoolYearId:s.admissionSeatPools.schoolYearId,capacity:s.admissionSeatPools.capacity,yearName:s.schoolYears.name}).from(s.admissionSeatPools).innerJoin(s.schoolYears,eq(s.schoolYears.id,s.admissionSeatPools.schoolYearId)).where(inArray(s.admissionSeatPools.programId,ids));
 const enrollments=await db.select({programId:s.enrollments.programId,schoolYearId:s.enrollments.schoolYearId,studentId:s.enrollments.studentProfileId}).from(s.enrollments).where(and(inArray(s.enrollments.programId,ids),eq(s.enrollments.kind,"program"),eq(s.enrollments.status,"active")));
 const offers=await db.select({programId:s.admissionOffers.programId,schoolYearId:s.admissionOffers.schoolYearId,status:s.admissionOffers.status,expiresAt:s.admissionOffers.expiresAt,studentId:s.applications.studentProfileId}).from(s.admissionOffers).innerJoin(s.applications,eq(s.applications.id,s.admissionOffers.applicationId)).where(inArray(s.admissionOffers.programId,ids));
 return pools.map(pool=>{
  const enrolled=new Set(enrollments.filter(e=>e.programId===pool.programId&&e.schoolYearId===pool.schoolYearId).map(e=>e.studentId));
  const reservations=new Set(offers.filter(o=>o.programId===pool.programId&&o.schoolYearId===pool.schoolYearId&&!enrolled.has(o.studentId)&&(o.status==="accepted"||(o.status==="issued"&&(!o.expiresAt||o.expiresAt.getTime()>Date.now())))).map(o=>o.studentId)).size;
  const occupied=enrolled.size+reservations;
  return {id:pool.id,programId:pool.programId,name:programs.find(p=>p.id===pool.programId)?.name??"Program",yearName:pool.yearName,capacity:pool.capacity,enrolled:enrolled.size,offered:reservations,remaining:Math.max(0,pool.capacity-occupied),status:occupied>=pool.capacity?"full":"available"};
 });
});

/** Registrar adjustment with a row lock; never reduces below occupied or held seats. */
export const updateAdmissionsCapacity=createServerFn({method:"POST"})
 .validator((data:unknown)=>z.object({poolId:z.string().uuid(),capacity:z.number().int("Capacity must be a positive whole number").min(1,"Capacity must be a positive whole number").max(100000,"Capacity must be a positive whole number")}).parse(data))
 .handler(async({data})=>{
  const actor=await requireActor(["registrar"],"enrollment.decide");
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  return db.transaction(async tx=>{
   const [pool]=await tx.select().from(s.admissionSeatPools).where(eq(s.admissionSeatPools.id,data.poolId)).for("update").limit(1);
   if(!pool)throw new Error("Seat pool not found");
   assertProgramGranted(actor,pool.programId);
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

/** Program/SchoolYear pairs in the registrar's scope that can receive a pool. */
export const listSeatPoolCandidates=createServerFn({method:"GET"})
 .validator((input:unknown)=>operationsSelectionSchema.parse(input??{}))
 .handler(async({data})=>{
  const actor=await requireActor(["registrar"],"enrollment.decide");
  const scoped=await resolveOperationsSelection(actor,data);
  if(!scoped.programIds.length||!process.env.DATABASE_URL)return [];
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  const programRows=await db.select({
   id:s.programs.id,name:s.programs.name,organizationId:s.programs.organizationId,siteId:s.programs.siteId,
  }).from(s.programs).where(inArray(s.programs.id,scoped.programIds)).limit(100);
  if(!programRows.length)return [];
  const years=await db.select({
   id:s.schoolYears.id,name:s.schoolYears.name,status:s.schoolYears.status,
   programId:s.schoolYears.programId,organizationId:s.schoolYears.organizationId,siteId:s.schoolYears.siteId,
  }).from(s.schoolYears).where(inArray(s.schoolYears.organizationId,
   [...new Set(programRows.map(program=>program.organizationId))]));
  const pools=await db.select({
   programId:s.admissionSeatPools.programId,schoolYearId:s.admissionSeatPools.schoolYearId,
  }).from(s.admissionSeatPools).where(inArray(s.admissionSeatPools.programId,
   programRows.map(program=>program.id)));
  return programRows.flatMap(program=>years
   .filter(year=>year.status!=="closed"&&schoolYearServesProgram(year,program)&&
    !pools.some(pool=>pool.programId===program.id&&pool.schoolYearId===year.id))
   .map(year=>({programId:program.id,programName:program.name,schoolYearId:year.id,yearName:year.name})));
 });

/** Create one audited pool for an authorized Program and its matching SchoolYear. */
export const createAdmissionsSeatPool=createServerFn({method:"POST"})
 .validator((value:unknown)=>z.object({
  programId:z.string().uuid(),schoolYearId:z.string().uuid(),
  capacity:z.number().int("Capacity must be a positive whole number")
   .min(1,"Capacity must be a positive whole number")
   .max(100000,"Capacity must be a positive whole number"),
 }).strict().parse(value))
 .handler(async({data})=>{
  const actor=await requireActor(["registrar"],"enrollment.decide");
  assertProgramGranted(actor,data.programId);
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  return db.transaction(async tx=>{
   const [program]=await tx.select({
    id:s.programs.id,organizationId:s.programs.organizationId,siteId:s.programs.siteId,
   }).from(s.programs).where(eq(s.programs.id,data.programId)).for("share").limit(1);
   const [year]=await tx.select({
    programId:s.schoolYears.programId,organizationId:s.schoolYears.organizationId,
    siteId:s.schoolYears.siteId,status:s.schoolYears.status,
   }).from(s.schoolYears).where(eq(s.schoolYears.id,data.schoolYearId)).for("share").limit(1);
   if(!program||!year||!schoolYearServesProgram(year,program))
    throw new Error("School year does not belong to this program or host site");
   if(year.status==="closed")throw new Error("Seat pools cannot be created for a closed school year");
   const [pool]=await tx.insert(s.admissionSeatPools).values({
    programId:data.programId,schoolYearId:data.schoolYearId,capacity:data.capacity,
   }).onConflictDoNothing({
    target:[s.admissionSeatPools.programId,s.admissionSeatPools.schoolYearId],
   }).returning({id:s.admissionSeatPools.id});
   if(!pool)throw new Error("A seat pool already exists for this program and school year. Adjust its capacity instead.");
   await recordAudit(tx,actor,{
    action:"admissions.capacity.create",resourceType:"admission_seat_pool",resourceId:pool.id,
    before:null,after:{capacity:data.capacity},
    scope:{programId:data.programId,schoolYearId:data.schoolYearId},
   });
   return {poolId:pool.id};
  });
 });

/** Compatibility for older route imports. */

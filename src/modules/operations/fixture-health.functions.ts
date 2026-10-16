import {createServerFn} from "@tanstack/react-start";
import {eq,sql} from "drizzle-orm";

/** Fixture presence is NOT functional acceptance. Always scope counts to synthetic records. */
export const getSyntheticFixtureHealth=createServerFn({method:"GET"}).handler(async()=>{
 const categories=[
  {key:"identity",name:"Synthetic students",route:"/student",minimum:1},
  {key:"admissions",name:"Synthetic applications",route:"/admissions",minimum:1},
  {key:"seats",name:"Synthetic admission seat pools",route:"/admissions/capacity",minimum:1},
  {key:"journeys",name:"Synthetic enrollment journeys",route:"/admissions/families",minimum:1},
  {key:"classes",name:"Synthetic academic sections",route:"/student/courses",minimum:1},
  {key:"groups",name:"Synthetic study groups",route:"/student/study-groups",minimum:1},
  {key:"actions",name:"Synthetic action items",route:"/operations",minimum:1},
  {key:"notices",name:"Synthetic notifications",route:"/student/notifications",minimum:1}
 ] as const;
 const empty=categories.map(c=>({...c,count:0,ok:false}));
 if(!process.env.DATABASE_URL)return {connected:false,checks:empty,ready:0,total:categories.length,admissions:{fresh:0,accepted:0,active:0,blocked:0}};
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const total=async <T extends {n:number}>(query:PromiseLike<T[]>)=>(await query)[0]?.n??0;
 const syntheticApps=sql`${s.applications.metadata}->>'synthetic' = 'true'`;
 const syntheticProgram=sql`${s.programs.metadata}->>'synthetic' = 'true'`;
 const [students,apps,pools,journeys,sections,groups,actions,notifications]=await Promise.all([
  total(db.select({n:sql<number>`count(distinct ${s.studentProfiles.id})::int`}).from(s.studentProfiles).innerJoin(s.applications,eq(s.applications.studentProfileId,s.studentProfiles.id)).where(syntheticApps)),
  total(db.select({n:sql<number>`count(*)::int`}).from(s.applications).where(syntheticApps)),
  total(db.select({n:sql<number>`count(*)::int`}).from(s.admissionSeatPools).innerJoin(s.programs,eq(s.programs.id,s.admissionSeatPools.programId)).where(syntheticProgram)),
  total(db.select({n:sql<number>`count(*)::int`}).from(s.journeys).innerJoin(s.applications,eq(s.applications.id,s.journeys.participantId)).where(sql`${s.journeys.participantType}='application' and ${syntheticApps}`)),
  total(db.select({n:sql<number>`count(*)::int`}).from(s.sections).innerJoin(s.programs,eq(s.programs.id,s.sections.programId)).where(syntheticProgram)),
  total(db.select({n:sql<number>`count(*)::int`}).from(s.studyGroups).innerJoin(s.programs,eq(s.programs.id,s.studyGroups.programId)).where(syntheticProgram)),
  total(db.select({n:sql<number>`count(*)::int`}).from(s.actions).innerJoin(s.programs,eq(s.programs.id,s.actions.programId)).where(syntheticProgram)),
  total(db.select({n:sql<number>`count(*)::int`}).from(s.notifications).innerJoin(s.people,eq(s.people.id,s.notifications.recipientPersonId)).where(sql`${s.people.metadata}->>'synthetic'='true'`))
 ]);
 const counts=[students,apps,pools,journeys,sections,groups,actions,notifications];
 const checks=categories.map((category,i)=>({...category,count:counts[i]??0,ok:(counts[i]??0)>=category.minimum}));
 const applicationRows=await db.select({id:s.applications.id,stage:s.applications.stage,studentProfileId:s.applications.studentProfileId,programId:s.applications.programId}).from(s.applications).where(syntheticApps);
 const ids=applicationRows.map(a=>a.id);
 const offers=ids.length?await db.select({applicationId:s.admissionOffers.applicationId,status:s.admissionOffers.status}).from(s.admissionOffers).where(sql`${s.admissionOffers.applicationId} in (${sql.join(ids.map(id=>sql`${id}::uuid`),sql`,`)})`):[];
 const enrolled=await db.select({studentProfileId:s.enrollments.studentProfileId,programId:s.enrollments.programId}).from(s.enrollments).where(sql`${s.enrollments.kind}='program' and ${s.enrollments.status}='active'`);
 const admissions={
  fresh:applicationRows.filter(a=>a.stage==="application"&&!offers.some(o=>o.applicationId===a.id)).length,
  accepted:applicationRows.filter(a=>offers.some(o=>o.applicationId===a.id&&o.status==="accepted")).length,
  active:applicationRows.filter(a=>enrolled.some(e=>e.studentProfileId===a.studentProfileId&&e.programId===a.programId)).length,
  blocked:applicationRows.filter(a=>a.stage==="application"&&offers.some(o=>o.applicationId===a.id&&o.status==="declined")).length
 };
 return {connected:true,checks,ready:checks.filter(c=>c.ok).length,total:checks.length,admissions};
});

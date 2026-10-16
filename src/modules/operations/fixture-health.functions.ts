import {createServerFn} from "@tanstack/react-start";
import {eq,sql} from "drizzle-orm";

/** Live fixture counts, not a claim that any golden flow has passed its acceptance tests. */
export const getSyntheticFixtureHealth=createServerFn({method:"GET"}).handler(async()=>{
 const categories=[
  {key:"identity",name:"Synthetic students",route:"/student",minimum:1},
  {key:"admissions",name:"Synthetic applications",route:"/admissions",minimum:1},
  {key:"seats",name:"Admission seat pools",route:"/admissions/capacity",minimum:1},
  {key:"journeys",name:"Enrollment journeys",route:"/admissions/families",minimum:1},
  {key:"classes",name:"Academic sections",route:"/student/courses",minimum:1},
  {key:"groups",name:"Study groups",route:"/student/study-groups",minimum:1},
  {key:"actions",name:"Open action items",route:"/operations",minimum:1},
  {key:"notices",name:"Notifications",route:"/student/notifications",minimum:1}
 ] as const;
 if(!process.env.DATABASE_URL)return {connected:false,checks:categories.map(c=>({...c,count:0,ok:false})),ready:0,total:categories.length};
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const total=async <T extends {n:number}>(query:PromiseLike<T[]>)=>(await query)[0]?.n??0;
 const [students,apps,pools,journeys,sections,groups,actions,notifications]=await Promise.all([
  total(db.select({n:sql<number>`count(*)::int`}).from(s.studentProfiles)),
  total(db.select({n:sql<number>`count(*)::int`}).from(s.applications).where(sql`${s.applications.metadata}->>'synthetic' = 'true'`)),
  total(db.select({n:sql<number>`count(*)::int`}).from(s.admissionSeatPools)),
  total(db.select({n:sql<number>`count(*)::int`}).from(s.journeys).where(eq(s.journeys.participantType,"application"))),
  total(db.select({n:sql<number>`count(*)::int`}).from(s.sections)),
  total(db.select({n:sql<number>`count(*)::int`}).from(s.studyGroups)),
  total(db.select({n:sql<number>`count(*)::int`}).from(s.actions)),
  total(db.select({n:sql<number>`count(*)::int`}).from(s.notifications))
 ]);
 const counts=[students,apps,pools,journeys,sections,groups,actions,notifications];
 const checks=categories.map((category,i)=>({...category,count:counts[i]??0,ok:(counts[i]??0)>=category.minimum}));
 return {connected:true,checks,ready:checks.filter(c=>c.ok).length,total:checks.length};
});

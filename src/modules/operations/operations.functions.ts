import {createServerFn} from "@tanstack/react-start";
import {dedupeQueue,notificationSummary,type QueueItem} from "@/domain/notification-triage";
/** Deliberately restricted to known synthetic GF41 actions; no arbitrary people or organization browsing. */
export const getOperationsPreview=createServerFn({method:"GET"}).handler(async()=>{
 if(!process.env.DATABASE_URL)return {items:[] as QueueItem[],summary:{total:0,urgent:0,needsResponse:0}};
 const [{db},s,{and,eq,desc}]=await Promise.all([import("@/db/client"),import("@/db/schema"),import("drizzle-orm")]);
 const rows=await db.select({id:s.actions.id,title:s.actions.title,description:s.actions.description,priority:s.actions.priority,metadata:s.actions.metadata,createdAt:s.actions.createdAt}).from(s.actions).where(and(eq(s.actions.type,"support_referral"),eq(s.actions.siteId,"f1000000-0000-4000-8000-000000000003"),eq(s.actions.subjectId,"f1000000-0000-4000-8000-000000000007"))).orderBy(desc(s.actions.createdAt)).limit(50);
 const items=dedupeQueue(rows.filter(r=>r.metadata.synthetic===true&&r.metadata.fixture==="gf41"&&r.metadata.stage!=="closed").map(r=>({id:r.id,kind:"action" as const,title:r.title,detail:"Synthetic student support referral requiring staff review",priority:r.priority==="urgent"?"critical" as const:r.priority==="high"?"high" as const:"normal" as const,createdAt:r.createdAt.toISOString(),href:"/student/support?referral="+encodeURIComponent(r.id),needsResponse:r.metadata.stage==="submitted"})));
 return {items,summary:notificationSummary(items)};
});

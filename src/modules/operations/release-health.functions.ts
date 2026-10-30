import {createServerFn} from "@tanstack/react-start";
import {classifySchema,requiredProfileTables} from "@/domain/release-health";
/** Safe read-only demo diagnostic; don't expose connection strings or database identifiers. */
export const getReleaseHealth=createServerFn({method:"GET"}).handler(async()=>{
 const buildId=(process.env.COMMIT_REF??process.env.GITHUB_SHA??"unknown").slice(0,12);
 if(!process.env.DATABASE_URL)return {buildId,schemaStatus:"unknown" as const,details:"Database is not configured"};
 const [{db},{sql}]=await Promise.all([import("@/db/client"),import("drizzle-orm")]);
 try{
  const rows=await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('qualification_claims','qualification_definitions','compliance_frameworks','qualification_verification_events')`);
  const names=rows.rows.map(x=>String(x.table_name));
  const schemaStatus=classifySchema([...requiredProfileTables],names);
  return {buildId,schemaStatus,details:schemaStatus==="aligned"?"Required qualification tables detected":"Required qualification tables missing; production migration pending"};
 }catch{return {buildId,schemaStatus:"unknown" as const,details:"Database health could not be verified"}}
});

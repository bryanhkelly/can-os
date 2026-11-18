#!/usr/bin/env node
/** Read-only Neon production-main verification for four in-place facility/resource relocations. */
import {neon} from "@neondatabase/serverless";

const MAIN="br-restless-sea-ar9ooo55";
const PROJECT="sweet-hall-62441909";
const tables={
  blueprint_facility_requirements:{oid:"411738",incoming:1,outgoing:2},
  site_space_capability_assertions:{oid:"411656",incoming:1,outgoing:4},
  shared_resource_pools:{oid:"404988",incoming:1,outgoing:2},
  professional_service_delivery_records:{oid:"407872",incoming:1,outgoing:4},
};
const readers={
  v27_check_facility_requirement:["public.blueprint_facility_requirements","public.site_space_capability_assertions"],
  v27_check_facility_verification:["public.site_space_capability_assertions"],
  v292_guard_fit_requirement_result:["public.site_space_capability_assertions"],
  v29_guard_evaluation_facility:["public.site_space_capability_assertions"],
  v30_guard_shared_resource_allocation:["public.shared_resource_pools"],
  validate_workforce_earning:["public.professional_service_delivery_records"],
};

async function main(){
  if(process.env.CAN_MAIN_FACILITY_RESOURCE_CHECK!=="1")
    throw Error("Set CAN_MAIN_FACILITY_RESOURCE_CHECK=1 for read-only production audit");
  if(!process.env.DATABASE_URL)throw Error("DATABASE_URL required");
  const sql=neon(process.env.DATABASE_URL);
  const [target]=await sql`SELECT current_setting('neon.project_id',true) project,
      current_setting('neon.branch_id',true) branch,current_database() db`;
  if(target?.project!==PROJECT||target?.branch!==MAIN||target?.db!=="neondb")
    throw Error("Refusing non-main database");

  const actual=await sql`
    SELECT c.relname name,c.oid::text oid,n.nspname schema_name,
      c.relrowsecurity rls,c.relforcerowsecurity forced,
      has_table_privilege('authenticated',c.oid,'SELECT') client_read,
      (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid=c.oid) policies,
      (SELECT count(*)::int FROM pg_constraint f WHERE f.confrelid=c.oid AND f.contype='f' AND f.convalidated) incoming,
      (SELECT count(*)::int FROM pg_constraint f WHERE f.conrelid=c.oid AND f.contype='f' AND f.convalidated) outgoing,
      (SELECT count(*)::int FROM pg_constraint f WHERE (f.confrelid=c.oid OR f.conrelid=c.oid)
        AND f.contype='f' AND NOT f.convalidated) invalid_fks
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('education_v30','public') AND c.relkind='r'
     AND c.relname IN ('blueprint_facility_requirements','site_space_capability_assertions',
       'shared_resource_pools','professional_service_delivery_records')
  `;
  if(actual.length!==4)throw Error("Duplicate or missing facility/resource relation");
  for(const row of actual){
    const expected=tables[row.name];
    if(!expected||row.schema_name!=="public"||row.oid!==expected.oid||
      !row.rls||!row.forced||row.client_read||row.policies!==1||
      row.incoming!==expected.incoming||row.outgoing!==expected.outgoing||
      row.invalid_fks!==0)
      throw Error("Moved relation failed security or FK check: "+row.name);
  }
  const functions=await sql`
    SELECT p.proname AS name,pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='education_v30'
      AND p.proname IN ('v27_check_facility_requirement','v27_check_facility_verification',
        'v292_guard_fit_requirement_result','v29_guard_evaluation_facility',
        'v30_guard_shared_resource_allocation','validate_workforce_earning')
  `;
  if(functions.length!==6)throw Error("Dependent function missing");
  for(const f of functions){
    if(!readers[f.name]?.every(x=>f.definition.includes(x)))
      throw Error("Unmigrated function table reference: "+f.name);
  }
  console.log(JSON.stringify({
    verified:true,readOnly:true,main:MAIN,tables:actual.length,
    validatedIncomingFks:actual.reduce((a,x)=>a+x.incoming,0),
    validatedOutgoingFks:actual.reduce((a,x)=>a+x.outgoing,0),
    functionsChecked:functions.length,forcedRls:true,
  },null,2));
}
main().catch(e=>{console.error("Facility/resource cutover check failed:",e.message);process.exitCode=1;});

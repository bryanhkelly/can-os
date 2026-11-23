import { test } from "node:test";
import assert from "node:assert/strict";
import { assertFriendlyUrlDeployment } from "./friendly-url-deploy-guards.mjs";

const id={projectId:"sweet-hall-62441909",branchId:"br-restless-sea-ar9ooo55",databaseName:"neondb"};
const schema={sites:true,organizations:true,marketing_packages:true,go_links:true,
  go_link_rls:true,site_rls:true,organization_rls:true,
  unique_go_code:true,valid_go_code_constraint:true,go_link_daily_visits:true,
  go_link_daily_visits_private:true,valid_go_lifecycle_constraint:true,
  unique_go_daily_counter:true};
const roles={count:2,unauthorizedSelects:0,applicationCanRead:true,applicationCanBypassGoRls:true,applicationCanCountRedirects:true};
const migrations = Array.from({length:8}, (_, i) => ({
  tag: i === 5 ? "0105_site_go_links"
    : i === 6 ? "0106_site_go_links_private_role_access"
    : i === 7 ? "0107_site_go_link_capabilities"
    : "010" + i + "_required",
  when: 100 + i, hash: "h" + i,
}));
const recorded=migrations.map(x=>({createdAt:x.when,hash:x.hash}));
const check=(i=id,s=schema,r=roles,rows=recorded)=>assertFriendlyUrlDeployment(i,s,r,rows,migrations);

test("exact migration and role evidence permits deployment",()=>assert.doesNotThrow(()=>check()));
test("wrong database and missing migrations fail closed",()=>{
  assert.throws(()=>check({...id,branchId:"dev"}),/BLOCKED/);
  assert.throws(()=>check(id,schema,roles,recorded.slice(1)),/not applied/);
  assert.throws(()=>check(id,schema,roles,[{createdAt:100,hash:"wrong"},...recorded.slice(1)]),/differs/);
});
test("missing any required release migration, not merely Go Links, blocks deployment",()=>{
  assert.throws(()=>check(id,schema,roles,recorded.filter(row=>row.createdAt!==102)),/not applied/);
  assert.throws(()=>check(id,schema,roles,[...recorded,{createdAt:108,hash:"surplus"}]),/unexpected migration/);
});
test("missing tables, RLS and constraints block deployment",()=>{
  for(const key of Object.keys(schema))assert.throws(()=>check(id,{...schema,[key]:false}),/BLOCKED/);
});
test("public reads or unavailable DB owner privileges block deployment",()=>{
  assert.throws(()=>check(id,schema,{...roles,unauthorizedSelects:1}),/BLOCKED/);
  assert.throws(()=>check(id,schema,{...roles,applicationCanRead:false}),/BLOCKED/);
  assert.throws(()=>check(id,schema,{...roles,applicationCanBypassGoRls:false}),/BLOCKED/);
  assert.throws(()=>check(id,schema,{...roles,applicationCanCountRedirects:false}),/BLOCKED/);
});

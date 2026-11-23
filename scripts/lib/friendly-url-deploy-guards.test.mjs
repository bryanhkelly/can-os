import { test } from "node:test";
import assert from "node:assert/strict";
import { assertFriendlyUrlDeployment } from "./friendly-url-deploy-guards.mjs";

const id={projectId:"sweet-hall-62441909",branchId:"br-restless-sea-ar9ooo55",databaseName:"neondb"};
const schema={sites:true,organizations:true,marketing_packages:true,go_links:true,
  go_link_rls:true,site_rls:true,organization_rls:true,
  unique_go_code:true,valid_go_code_constraint:true};
const roles={count:2,unauthorizedSelects:0,applicationCanRead:true,applicationCanBypassGoRls:true};
const migrations=[{tag:"0105_site_go_links",when:100,hash:"h105"},
  {tag:"0106_site_go_links_private_role_access",when:101,hash:"h106"}];
const recorded=migrations.map(x=>({createdAt:x.when,hash:x.hash}));
const check=(i=id,s=schema,r=roles,rows=recorded)=>assertFriendlyUrlDeployment(i,s,r,rows,migrations);

test("exact migration and role evidence permits deployment",()=>assert.doesNotThrow(()=>check()));
test("wrong database and missing migrations fail closed",()=>{
  assert.throws(()=>check({...id,branchId:"dev"}),/BLOCKED/);
  assert.throws(()=>check(id,schema,roles,recorded.slice(1)),/not applied/);
  assert.throws(()=>check(id,schema,roles,[{createdAt:100,hash:"wrong"},recorded[1]]),/differs/);
});
test("missing tables, RLS and constraints block deployment",()=>{
  for(const key of Object.keys(schema))assert.throws(()=>check(id,{...schema,[key]:false}),/BLOCKED/);
});
test("public reads or unavailable DB owner privileges block deployment",()=>{
  assert.throws(()=>check(id,schema,{...roles,unauthorizedSelects:1}),/BLOCKED/);
  assert.throws(()=>check(id,schema,{...roles,applicationCanRead:false}),/BLOCKED/);
  assert.throws(()=>check(id,schema,{...roles,applicationCanBypassGoRls:false}),/BLOCKED/);
});

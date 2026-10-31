#!/usr/bin/env node
/**
 * External, non-mutating acceptance for an approved Netlify deployment.
 * Run only with TWO published, DIFFERENT tenant slugs; never uses production
 * credentials, simulated Host overrides, or anonymous POST writes.
 * Node 22+ required. A nonzero exit means evidence was not established.
 */
import assert from "node:assert/strict";

const domain=process.env.CAN_PUBLIC_SMOKE_DOMAIN;
const first=process.env.CAN_PUBLIC_SMOKE_TENANT_A;
const second=process.env.CAN_PUBLIC_SMOKE_TENANT_B;
const unpublished=process.env.CAN_PUBLIC_SMOKE_UNPUBLISHED;
const unknown=process.env.CAN_PUBLIC_SMOKE_UNKNOWN;
const expectedA=process.env.CAN_PUBLIC_SMOKE_NAME_A;
const expectedB=process.env.CAN_PUBLIC_SMOKE_NAME_B;
if (![domain,first,second,unpublished,unknown,expectedA,expectedB].every(Boolean))
 throw new Error("Set CAN_PUBLIC_SMOKE_DOMAIN, TENANT_A, TENANT_B, UNPUBLISHED, UNKNOWN, NAME_A and NAME_B.");
const slug=/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/;
assert.match(domain,/^[a-z0-9.-]+$/);
for(const name of [first,second,unpublished,unknown])assert.match(name,slug);
assert.equal(new Set([first,second,unpublished,unknown]).size,4,"Use four distinct slugs");
const evidence={checkedAt:new Date().toISOString(),domain,checks:[]};
async function check(slug,path,expectedStatus,expectIdentity=null){
 const url=`https://${slug}.${domain}${path}`;
 const response=await fetch(url,{redirect:"manual",signal:AbortSignal.timeout(8000),headers:{Accept:"text/html"}});
 const type=response.headers.get("content-type")??"";
 const body=await response.text();
 assert.equal(response.status,expectedStatus,`${url}: unexpected HTTP status`);
 assert.ok(!response.headers.get("location"),`${url}: redirects forbidden`);
 if(expectIdentity){
  assert.match(type,/text\/html/i);
  assert.ok(body.startsWith("<!doctype html>"),`${url}: missing standalone HTML`);
  assert.ok(body.includes(`<footer>${slug}.${domain} · Powered by CAN OS</footer>`),
    `${url}: wrong tenant identity`);
  assert.ok(body.includes(expectIdentity),`${url}: missing expected public school name`);
  const other=expectIdentity===expectedA?expectedB:expectedA;
  assert.ok(!body.includes(other),`${url}: cross-tenant content leaked`);
  assert.ok(!body.includes("__tanstack"),`${url}: app shell leaked`);
 }else{
  assert.ok(!body.includes("Powered by CAN OS"),`${url}: unpublished/unknown/private site disclosed`);
 }
 evidence.checks.push({url,status:response.status,contentType:type,
  identity:expectIdentity?"expected tenant HTML":"denied"});
}
try{
 await check(first,"/",200,expectedA);
 await check(second,"/",200,expectedB);
 for(const name of [unpublished,unknown])await check(name,"/",404);
 for(const name of [first,second]){
  for(const path of ["/operations","/access","/_serverFn","/api","/admin","/assets/index.js"])
   await check(name,path,404);
 }
 process.stdout.write(JSON.stringify({result:"PASS",...evidence},null,2)+"\n");
}catch(error){
 process.stderr.write(JSON.stringify({result:"FAIL",...evidence,error:String(error)},null,2)+"\n");
 process.exitCode=1;
}

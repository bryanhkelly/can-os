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
const MAX_RESPONSE_BYTES=1_000_000;
async function readLimited(response){
 const length=response.headers.get("content-length");
 if(length!==null)assert.ok(Number.isFinite(Number(length))&&Number(length)<=MAX_RESPONSE_BYTES,"response length exceeds limit");
 assert.ok(response.body,"missing response stream");
 const reader=response.body.getReader();
 const parts=[];
 let size=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   size+=value.byteLength;
   if(size>MAX_RESPONSE_BYTES)throw new Error("response body exceeds 1 MB limit");
   parts.push(value);
  }
 }finally{
  await reader.cancel().catch(()=>{});
  reader.releaseLock();
 }
 return new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(parts));
}
const evidence={checkedAt:new Date().toISOString(),domain,checks:[]};
async function check(slug,path,expectedStatus,expectIdentity=null){
 const url=`https://${slug}.${domain}${path}`;
 const response=await fetch(url,{redirect:"manual",signal:AbortSignal.timeout(8000),headers:{Accept:"text/html"}});
 const type=response.headers.get("content-type")??"";
 const body=await readLimited(response);
 assert.equal(response.status,expectedStatus,`${url}: unexpected HTTP status`);
 assert.ok(!response.headers.get("location"),`${url}: redirects forbidden`);
 if(expectIdentity){
  assert.match(type,/text\/html/i);
  assert.match(response.headers.get("cache-control")??"",/no-store/i,`${url}: public tenant page must not be cached`);
  assert.ok((response.headers.get("vary")??"").toLowerCase().split(",").map(x=>x.trim()).includes("host"),`${url}: missing Vary: Host`);
  assert.ok(body.startsWith("<!doctype html>"),`${url}: missing standalone HTML`);
  assert.ok(body.includes(`<footer>${slug}.${domain} · Powered by CAN OS</footer>`),
    `${url}: wrong tenant identity`);
  assert.ok(body.includes(`<h1>${expectIdentity}</h1>`),`${url}: missing expected public school heading`);
  const other=expectIdentity===expectedA?expectedB:expectedA;
  assert.ok(!body.includes(`<h1>${other}</h1>`),`${url}: cross-tenant school heading leaked`);
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
 // Optional external negative fixtures MUST belong to approved isolated test deployment.
 const disabledUrl=process.env.CAN_PUBLIC_SMOKE_DISABLED_URL;
 if(disabledUrl){
  const target=new URL(disabledUrl);
  assert.equal(target.protocol,"https:","Disabled fixture must use HTTPS");
  const r=await fetch(target,{redirect:"manual",signal:AbortSignal.timeout(8000)});
  assert.equal(r.status,404,`${target}: disabled hosting must deny anonymous tenant access`);
  evidence.checks.push({url:String(target),status:r.status,identity:"hosting-disabled denied"});
  await r.body?.cancel();
 }
 const invalidTlsUrl=process.env.CAN_PUBLIC_SMOKE_INVALID_TLS_URL;
 if(invalidTlsUrl){
  const target=new URL(invalidTlsUrl);
  assert.equal(target.protocol,"https:","Invalid-certificate fixture must use HTTPS");
  let tlsError=false;
  try{
   const r=await fetch(target,{redirect:"manual",signal:AbortSignal.timeout(8000)});
   await r.body?.cancel();
  }catch(error){
   const cause=error?.cause?.code??"";
   tlsError=/^(ERR_TLS_CERT_ALTNAME_INVALID|CERT_HAS_EXPIRED|DEPTH_ZERO_SELF_SIGNED_CERT|UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT_LOCALLY|SELF_SIGNED_CERT_IN_CHAIN)$/.test(String(cause));
  }
  assert.ok(tlsError,`${target}: expected a certificate-validation failure, not DNS or timeout`);
  evidence.checks.push({url:String(target),status:"TLS_REJECTED",identity:"invalid certificate denied"});
 }
 process.stdout.write(JSON.stringify({result:"PASS",...evidence},null,2)+"\n");
}catch(error){
 process.stderr.write(JSON.stringify({result:"FAIL",...evidence,error:String(error)},null,2)+"\n");
 process.exitCode=1;
}

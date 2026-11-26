import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { identityArchitectureViolations, identityCompatibilityReferences } from "./identity-architecture.mjs";

const parse=(file,source)=>ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
const check=(file,source)=>identityArchitectureViolations(file,parse(file,source),ts);
test("canonical identity rejects fixture literals and aliased or relative fixture dependencies",()=>{
  const file="src/modules/identity/session-grants.server.ts";
  for(const code of [
    'const domain="valorschool.demo";',
    'import {LOCAL_DEMO_ADMIN} from "@/domain/local-demo-access";',
    'export {LOCAL_DEMO_ADMIN} from "../../domain/local-demo-access";',
    'const adapter=await import("@/domain/local-demo-access");',
  ])assert.ok(check(file,code).length>0,code);
  assert.deepEqual(check(file,'import {isDemoAccountEmail} from "@/domain/domain-classification";'),[]);
});
test("pure domain contracts do not depend on presentation or infrastructure",()=>{
  const file="src/domain/domain-classification.ts";
  for(const code of ['import {db} from "@/db/client";','import React from "react";',
    'import {query} from "../modules/identity/reader.server";','const driver=await import("drizzle-orm");'])
    assert.ok(check(file,code).length>0,code);
  assert.deepEqual(check(file,'import type {Shape} from "./identity-types";'),[]);
});
test("only credential generation and verification owners hash account credentials",()=>{
  const source='const hash=hashPrivateAccessCode(code,pepper);';
  assert.ok(check("src/modules/enrollment/other.server.ts",source).length);
  assert.deepEqual(check("src/modules/identity/private-account-credential.server.ts",source),[]);
  assert.deepEqual(check("src/modules/identity/passwordless-access.server.ts",source),[]);
});
test("compatibility inventory does not classify ordinary email policy as a violation",()=>{
  const file="src/modules/identity/legacy-shared-credential-grants.server.ts";
  const source='const scope=LOCAL_DEMO_ADMIN; const domain="valorschool.demo"; const flag=demoTenant;';
  assert.deepEqual(identityCompatibilityReferences(parse(file,source),ts),[
    "classification/operational boundary review","fixture credential/configuration symbol","institution-specific literal"]);
  assert.deepEqual(identityCompatibilityReferences(parse(file,'isDemoAccountEmail(email);'),ts),[]);
});

test("provider email dispatch cannot be implemented in a business workflow",()=>{
  const file="src/modules/enrollment/registration.server.ts";
  assert.ok(check(file,'await fetch("https://api.resend.com/emails",options)').length);
  assert.ok(check(file,'import {Resend} from "resend";').length);
  assert.deepEqual(check(file,'import {submitResendEmail} from "@/modules/communication/resend-email-transport.server";'),[]);
  assert.deepEqual(check("src/modules/communication/resend-email-transport.server.ts",
    'await fetch("https://api.resend.com/emails",options)'),[]);
});

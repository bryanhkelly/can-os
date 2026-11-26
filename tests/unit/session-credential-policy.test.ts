import { describe, expect, it } from "vitest";
import { sessionCredentialMode, type SessionAuthenticationMethod } from "@/domain/session-credential-policy";

describe("session credential provenance",()=>{
  const demo="participant@nested.school.demo";
  const real="participant@school.org";
  const cases: Array<[string,boolean,SessionAuthenticationMethod|null,"individual"|"legacy"|"denied"]> = [
    [demo,true,"private_access_code","individual"],
    [demo,true,"local_demo_code","denied"],
    [demo,true,"email_link","denied"],
    [demo,true,null,"denied"],
    [demo,false,"private_access_code","denied"],
    [demo,false,"email_link","denied"],
    [demo,false,"local_demo_code","legacy"],
    [demo,false,null,"legacy"],
    [real,true,"private_access_code","denied"],
    [real,true,"local_demo_code","denied"],
    [real,true,"email_link","denied"],
    [real,true,null,"denied"],
    [real,false,"private_access_code","denied"],
    [real,false,"local_demo_code","denied"],
    [real,false,"email_link","legacy"],
    [real,false,null,"legacy"],
  ];
  it.each(cases)("reconciles %s / %s / %s as %s",(email,privateCredential,authenticationMethod,expected)=>{
    expect(sessionCredentialMode({email,privateCredential,authenticationMethod})).toBe(expected);
  });
});

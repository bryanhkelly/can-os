import { describe, expect, it, vi } from "vitest";
import { fromJSON, toJSON } from "seroval";
import { DomainError } from "@/domain/errors";
import { AuthorizationError } from "@/domain/command-context";
import { normalizeClientError } from "@/lib/client-error";
import { sanitizeServerError, withSafeServerErrors } from "@/lib/server-error-middleware";
import { RetryableLoaderError, safeLoader } from "@/lib/safe-loader";
import { notFound, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { mutationErrorMessage } from "@/lib/mutation-feedback";

describe("client-safe error contract",()=>{
  it.each([
    ["AUTHENTICATION_REQUIRED","authentication"],["FORBIDDEN","authorization"],
    ["VALIDATION_FAILED","validation"],["CONFLICT","conflict"],
    ["UNAVAILABLE","unavailable"],["CANCELLED","unavailable"],["UNEXPECTED","unexpected"],
  ] as const)("classifies serialized %s without trusting its message",(code,kind)=>{
    expect(normalizeClientError({code,message:"database password"})).toMatchObject({code,kind});
    expect(normalizeClientError({code,message:"database password"}).message).not.toContain("password");
  });
  it("uses explicit session codes and never matches message substrings",()=>{
    expect(normalizeClientError(new AuthorizationError("authenticated session")).kind).toBe("authentication");
    expect(normalizeClientError({name:"AuthorizationError",message:"authenticated session"}).kind).toBe("authorization");
    expect(normalizeClientError(new Error("not authorized")).kind).toBe("unexpected");
  });
  it.each([undefined,null,42,"private database URL",{message:"private database URL"},new Error("private database URL")])(
    "hides unknown failures: %s",error=>{
      expect(normalizeClientError(error).message).not.toContain("database");
      expect(mutationErrorMessage(error,"Unable to save.")).toBe("Unable to save.");
    });
  it("sanitizes Error serialization including stack and custom own properties",()=>{
    const error=new DomainError("CONFLICT","private diagnostic");
    Object.assign(error,{query:"sensitive SQL"});
    const safe=sanitizeServerError(error);
    const serialized=toJSON(safe);
    expect(JSON.stringify(serialized)).not.toMatch(/sensitive SQL|private diagnostic/);
    expect(normalizeClientError(fromJSON(serialized))).toMatchObject({code:"CONFLICT",kind:"conflict"});
  });
  it("logs unknown diagnostics on the server and emits only safe information",()=>{
    const log=vi.spyOn(console,"error").mockImplementation(()=>{});
    try{
      const error=new Error("secret connection string");
      const safe=sanitizeServerError(error);
      expect(log).toHaveBeenCalledWith("Server function failed",error);
      expect(JSON.stringify(toJSON(safe))).not.toContain("secret connection");
    }finally{log.mockRestore();}
  });
  it("uses the same classification with context-specific safe loader presentation",async()=>{
    const error={code:"FORBIDDEN",message:"internal capability"};
    const outcome=await safeLoader(async()=>{throw error;})();
    expect(outcome).toMatchObject({ok:false,kind:"authorization",message:"You do not have permission to view this page."});
    expect(mutationErrorMessage(error,"fallback")).toBe(normalizeClientError(error).message);
  });
  it.each([redirect({href:"/access"}),notFound(),new Response(null,{status:401})])(
    "preserves router and response control flow",async control=>{
      await expect(withSafeServerErrors(async()=>{throw control;})).rejects.toBe(control);
    });
  it("sanitizes rejected operations and retains retryability across serialization",async()=>{
    const log=vi.spyOn(console,"error").mockImplementation(()=>{});
    try {
      await expect(withSafeServerErrors(async()=>{throw new Error("secret query");})).rejects.toMatchObject({
        code:"UNEXPECTED",message:normalizeClientError(null).message,
      });
      const error=fromJSON(toJSON(sanitizeServerError(new RetryableLoaderError("private retry diagnostic"))));
      expect(normalizeClientError(error)).toMatchObject({kind:"unexpected",retryable:true});
    } finally { log.mockRestore(); }
  });
  it("classifies validator failures without serializing rejected values or schema details",()=>{
    const parsed=z.object({personId:z.string().uuid()}).safeParse({personId:"private-value"});
    if(parsed.success)throw new Error("Expected invalid fixture");
    const safe=sanitizeServerError(parsed.error);
    expect(safe).toMatchObject({code:"VALIDATION_FAILED"});
    expect(JSON.stringify(toJSON(safe))).not.toContain("private-value");
    expect(JSON.stringify(toJSON(safe))).not.toContain("Invalid uuid");
  });
});

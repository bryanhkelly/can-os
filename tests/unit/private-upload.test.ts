import { afterEach, describe, expect, it, vi } from "vitest";
import { createPrivateUploadTask, documentUploadPolicy, privateUploadSchema, uploadPrivateFile, validateUploadFile } from "@/platform/storage/private-upload";
import { createPrivateUpload } from "@/platform/storage/r2";
import { checkR2Cors } from "@/platform/storage/r2-cors";

const file=new File(["isolated deterministic file"],"fixture.pdf",{type:"application/pdf"});
const contract={key:"private-key",uploadUrl:"https://private.test/put",
  uploadHeaders:{"Content-Type":"application/pdf","If-None-Match":"*"},expiresInSeconds:180};
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe("private upload contract",()=>{
  it("returns the exact signed headers, expiry and domain key",()=>{
    vi.stubEnv("CAN_R2_ACCOUNT_ID","a".repeat(32));vi.stubEnv("CAN_R2_BUCKET","test-bucket");
    vi.stubEnv("CAN_R2_ACCESS_KEY_ID","test-key");vi.stubEnv("CAN_R2_SECRET_ACCESS_KEY","test-secret");
    const upload=createPrivateUpload({key:"test/key",keyPattern:/^test\/key$/,contentType:file.type,
      contentLength:file.size,minContentLength:16,maxContentLength:100,preventOverwrite:true});
    expect(privateUploadSchema.parse(upload)).toEqual(upload);
    expect(upload).toMatchObject({key:"test/key",expiresInSeconds:180,uploadHeaders:contract.uploadHeaders});
    const url=new URL(upload.uploadUrl);
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("content-type;host;if-none-match");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("180");
  });
  it.each([0,15,10*1024*1024+1])("rejects a file of %s bytes",size=>{
    expect(()=>validateUploadFile(new File([new Uint8Array(size)],"fixture.pdf",{type:file.type}),documentUploadPolicy)).toThrow();
  });
  it.each([16,10*1024*1024])("accepts the exact %s-byte boundary",size=>{
    expect(()=>validateUploadFile(new File([new Uint8Array(size)],"fixture.pdf",{type:file.type}),documentUploadPolicy)).not.toThrow();
  });
  it("retries finalization without beginning or putting again, including repeated calls",async()=>{
    const put=vi.fn(async()=>new Response(null,{status:200}));vi.stubGlobal("fetch",put);
    const begin=vi.fn(async()=>contract);
    const finish=vi.fn().mockRejectedValueOnce(new Error("retry")).mockResolvedValue("recorded");
    const task=createPrivateUploadTask({file,policy:documentUploadPolicy,begin,finish});
    const first=task.run();expect(task.run()).toBe(first);
    await expect(first).rejects.toThrow("retry");
    await expect(task.run()).resolves.toBe("recorded");
    await expect(task.run()).resolves.toBe("recorded");
    expect(begin).toHaveBeenCalledTimes(1);expect(put).toHaveBeenCalledTimes(1);
    expect(finish).toHaveBeenCalledTimes(2);
    expect(put).toHaveBeenCalledWith(contract.uploadUrl,expect.objectContaining({headers:contract.uploadHeaders,body:file,method:"PUT"}));
  });
  it("never finalizes failed PUTs and retries transport on the next attempt",async()=>{
    const put=vi.fn().mockResolvedValueOnce(new Response(null,{status:403})).mockResolvedValue(new Response(null,{status:200}));
    vi.stubGlobal("fetch",put);
    const finish=vi.fn(async()=>{});
    const begin=vi.fn(async()=>contract);
    const task=createPrivateUploadTask({file,policy:documentUploadPolicy,begin,finish});
    await expect(task.run()).rejects.toMatchObject({uploadCode:"transport"});
    expect(finish).not.toHaveBeenCalled();
    await task.run();expect(begin).toHaveBeenCalledTimes(2);
  });
  it("supports cancellation and preserves successful bytes when cancelled before finish",async()=>{
    const controller=new AbortController();
    const begin=vi.fn(async()=>contract);const finish=vi.fn(async()=>{});
    const put=vi.fn(async()=>{controller.abort();return new Response(null,{status:200});});
    vi.stubGlobal("fetch",put);
    const task=createPrivateUploadTask({file,policy:documentUploadPolicy,begin,finish});
    await expect(task.run(controller.signal)).rejects.toMatchObject({uploadCode:"cancelled"});
    expect(finish).not.toHaveBeenCalled();
    await task.run();
    expect(put).toHaveBeenCalledTimes(1);expect(finish).toHaveBeenCalledTimes(1);
  });
  it("rejects aborted requests and malformed contracts before network access",async()=>{
    const put=vi.fn();vi.stubGlobal("fetch",put);
    const controller=new AbortController();controller.abort();
    await expect(uploadPrivateFile(file,contract,controller.signal)).rejects.toMatchObject({uploadCode:"cancelled"});
    await expect(uploadPrivateFile(file,{...contract,uploadHeaders:{}})).rejects.toMatchObject({uploadCode:"invalid-contract"});
    await expect(uploadPrivateFile(file,{...contract,expiresInSeconds:0})).rejects.toMatchObject({uploadCode:"invalid-contract"});
    await expect(uploadPrivateFile(file,{...contract,uploadUrl:"http://private.test/put"})).rejects.toMatchObject({uploadCode:"invalid-contract"});
    await expect(uploadPrivateFile(file,{...contract,uploadUrl:"invalid-url"})).rejects.toMatchObject({uploadCode:"invalid-contract"});
    expect(put).not.toHaveBeenCalled();
  });
  it("reports active transport cancellation without finalizing",async()=>{
    const controller=new AbortController();
    const finish=vi.fn(async()=>{});
    vi.stubGlobal("fetch",vi.fn(async(_url:unknown,init:RequestInit)=>{
      expect(init.signal).toBe(controller.signal);
      controller.abort();
      throw new DOMException("Aborted","AbortError");
    }));
    const task=createPrivateUploadTask({file,policy:documentUploadPolicy,begin:async()=>contract,finish});
    await expect(task.run(controller.signal)).rejects.toMatchObject({uploadCode:"cancelled",code:"CANCELLED"});
    expect(finish).not.toHaveBeenCalled();
  });
});
describe("R2 CORS configuration checks",()=>{
  const origin="https://school.example";
  const config=(headers=["Content-Type","If-None-Match"],origins=[origin])=>({
    rules:[{allowed:{origins,methods:["PUT","GET","HEAD"],headers}}],
  });
  it("requires both signed headers for every approved origin",()=>{
    expect(checkR2Cors(config(),[origin])).toEqual([]);
    expect(checkR2Cors(config(["content-type"]),[origin]).join()).toContain("If-None-Match");
    expect(checkR2Cors(config(),[origin,"https://other.example"])).toHaveLength(1);
  });
  it("rejects wildcard origins/headers, invalid structures and missing approved origins",()=>{
    expect(checkR2Cors(config(["*"],["*"]),[origin]).length).toBeGreaterThan(0);
    expect(checkR2Cors({},[origin])).not.toEqual([]);
    expect(checkR2Cors(config(),[])).not.toEqual([]);
  });
});

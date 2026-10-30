import {afterEach,describe,expect,it,vi} from "vitest";
import {newDocumentKey,signR2Object,validateDocumentUpload} from "@/modules/enrollment/r2-documents.server";
const app="11111111-1111-4111-8111-111111111111",req="22222222-2222-4222-8222-222222222222";
const original={...process.env};
afterEach(()=>{process.env={...original};vi.restoreAllMocks();});
describe("private Cloudflare R2 upload controls",()=>{
 it("creates unique object keys only under a scoped enrollment requirement",()=>{
  const one=newDocumentKey(app,req),two=newDocumentKey(app,req);
  expect(one.startsWith("enrollment/"+app+"/"+req+"/")).toBe(true);
  expect(one).not.toBe(two);
  expect(()=>newDocumentKey("../../../",req)).toThrow();
 });
 it("signs short-lived single-object PUT URLs without exposing the secret",()=>{
  process.env.CAN_R2_ACCOUNT_ID="a".repeat(32);
  process.env.CAN_R2_BUCKET="can-os-synthetic";
  process.env.CAN_R2_ACCESS_KEY_ID="test-access-key";
  process.env.CAN_R2_SECRET_ACCESS_KEY="do-not-expose-secret";
  const url=new URL(signR2Object("PUT",newDocumentKey(app,req),"application/pdf",180));
  expect(url.hostname).toBe("a".repeat(32)+".r2.cloudflarestorage.com");
  expect(url.pathname).toContain("/can-os-synthetic/enrollment/");
  expect(url.searchParams.get("X-Amz-Expires")).toBe("180");
  expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("content-type;host");
  expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/);
  expect(url.toString()).not.toContain("do-not-expose-secret");
  expect(()=>signR2Object("PUT","enrollment/../../other","application/pdf")).toThrow();
 });
 it("requires safe file names, size and supported MIME types",()=>{
  expect(()=>validateDocumentUpload("report.pdf","application/pdf",2048)).not.toThrow();
  expect(()=>validateDocumentUpload("report.pdf","application/pdf",15)).toThrow();
  expect(()=>validateDocumentUpload("../bad.pdf","application/pdf",2048)).toThrow();
  expect(()=>validateDocumentUpload("report.svg","image/svg+xml",2048)).toThrow();
  expect(()=>validateDocumentUpload("report.pdf","application/pdf",11*1024*1024)).toThrow();
 });
});

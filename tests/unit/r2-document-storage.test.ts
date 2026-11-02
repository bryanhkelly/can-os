import {afterEach,describe,expect,it,vi} from "vitest";
import {createEnrollmentUpload,newDocumentKey,signR2Object,validateDocumentUpload} from "@/modules/enrollment/r2-documents.server";
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
 it("signs scoped enrollment uploads and downloads without exposing the secret",()=>{
  process.env.CAN_R2_ACCOUNT_ID="a".repeat(32);
  process.env.CAN_R2_BUCKET="can-os-synthetic";
  process.env.CAN_R2_ACCESS_KEY_ID="test-access-key";
  process.env.CAN_R2_SECRET_ACCESS_KEY="do-not-expose-secret";
  const upload=createEnrollmentUpload(newDocumentKey(app,req),"application/pdf",2048,"live");
  const url=new URL(upload.uploadUrl);
  expect(url.hostname).toBe("a".repeat(32)+".r2.cloudflarestorage.com");
  expect(url.pathname).toContain("/can-os-synthetic/enrollment/");
  expect(url.searchParams.get("X-Amz-Expires")).toBe("180");
  expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("content-type;host");
  expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/);
  expect(url.toString()).not.toContain("do-not-expose-secret");
  expect(upload.uploadHeaders).toEqual({"Content-Type":"application/pdf"});
  expect(upload.objectKey).toMatch(new RegExp(`^enrollment/${app}/${req}/`));
  expect(Date.parse(upload.expiresAt)).toBeGreaterThan(Date.now());
  expect(new URL(upload.uploadUrl).hostname).toBe(url.hostname);
  expect(()=>createEnrollmentUpload(newDocumentKey(app,req),"application/pdf",15,"live")).toThrow();
  const download=new URL(signR2Object(newDocumentKey(app,req),180));
  expect(download.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
  expect(()=>signR2Object("enrollment/../../other")).toThrow();
 });
 it("uses separate demo-tenant credentials and refuses a missing demo bucket",()=>{
  process.env.CAN_R2_DEMO_ACCOUNT_ID="b".repeat(32);
  process.env.CAN_R2_DEMO_BUCKET="can-os-demo";
  process.env.CAN_R2_DEMO_ACCESS_KEY_ID="demo-access";
  process.env.CAN_R2_DEMO_SECRET_ACCESS_KEY="demo-secret";
  const url=new URL(signR2Object(newDocumentKey(app,req),180,"demo"));
  expect(url.hostname).toBe("b".repeat(32)+".r2.cloudflarestorage.com");
  expect(url.pathname).toContain("/can-os-demo/enrollment/");
  expect(url.toString()).not.toContain("demo-secret");
  const upload=createEnrollmentUpload(newDocumentKey(app,req),"application/pdf",2048,"demo");
  expect(upload.uploadHeaders).toEqual({"Content-Type":"application/pdf"});
  expect(new URL(upload.uploadUrl).pathname).toContain("/can-os-demo/enrollment/");

  delete process.env.CAN_R2_DEMO_ACCOUNT_ID;
  expect(()=>createEnrollmentUpload(newDocumentKey(app,req),"application/pdf",2048,"demo"))
   .toThrow("Isolated demo R2 storage is not configured");
  expect(()=>signR2Object(newDocumentKey(app,req),180,"demo"))
   .toThrow("Isolated demo R2 storage is not configured");
 });
 it("requires safe file names, size and supported MIME types",()=>{
  expect(()=>validateDocumentUpload("report.pdf","application/pdf",2048)).not.toThrow();
  expect(()=>validateDocumentUpload("report.pdf","application/pdf",15)).toThrow();
  expect(()=>validateDocumentUpload("../bad.pdf","application/pdf",2048)).toThrow();
  expect(()=>validateDocumentUpload("report.svg","image/svg+xml",2048)).toThrow();
  expect(()=>validateDocumentUpload("report.pdf","application/pdf",11*1024*1024)).toThrow();
 });
});

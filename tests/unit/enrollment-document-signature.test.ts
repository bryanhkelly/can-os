import {describe,it,expect} from "vitest";
import {matchesEnrollmentDocumentSignature as valid} from "@/domain/enrollment-document-signature";
const bytes=(...values:number[])=>new Uint8Array(values);
describe("Cloudflare R2 enrollment document signature check",()=>{
 it("accepts PDF magic bytes",()=>{
  expect(valid("application/pdf",bytes(37,80,68,70,45,49,46,55))).toBe(true);
  expect(valid("application/pdf",bytes(37,80,68,70))).toBe(false);
 });
 it("accepts JPEG and PNG headers",()=>{
  expect(valid("image/jpeg",bytes(255,216,255,224))).toBe(true);
  expect(valid("image/png",bytes(137,80,78,71,13,10,26,10,1))).toBe(true);
 });
 it("rejects misleading MIME types and unsupported types",()=>{
  expect(valid("application/pdf",bytes(137,80,78,71,13,10,26,10))).toBe(false);
  expect(valid("image/png",bytes(255,216,255))).toBe(false);
  expect(valid("image/jpeg",bytes(37,80,68,70,45))).toBe(false);
  expect(valid("image/svg+xml",bytes(60,115,118,103))).toBe(false);
 });
});

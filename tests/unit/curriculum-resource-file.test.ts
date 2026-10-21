import { describe, expect, it } from "vitest";
import { curriculumPdfKeyPattern, isCurriculumPdfKeyForResource, hasPdfMagic, maxCurriculumPdfBytes } from "@/domain/curriculum-resource-file";

const id="123e4567-e89b-42d3-a456-426614174000";
const random="123e4567-e89b-42d3-a456-426614174001";

describe("curriculum PDF resource policy",()=>{
 it("limits storage access to a resource-specific private key",()=>{
  const key=`learning/supplements/${id}/${random}`;
  expect(curriculumPdfKeyPattern.test(key)).toBe(true);
  expect(isCurriculumPdfKeyForResource(key,id)).toBe(true);
  expect(isCurriculumPdfKeyForResource(key,random)).toBe(false);
  expect(isCurriculumPdfKeyForResource("learning/supplements/../password",id)).toBe(false);
  expect(isCurriculumPdfKeyForResource("enrollment/"+id+"/"+random,id)).toBe(false);
 });
 it("validates a bounded PDF magic sample and rejects other file types",()=>{
  expect(hasPdfMagic(new Uint8Array([37,80,68,70,45,49,46,55]))).toBe(true);
  expect(hasPdfMagic(new Uint8Array([37,80,68,70]))).toBe(false);
  expect(hasPdfMagic(new Uint8Array([80,75,3,4,0,0]))).toBe(false);
  expect(maxCurriculumPdfBytes).toBe(10*1024*1024);
 });
});

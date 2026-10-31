import {describe,expect,it} from "vitest";
import {academicDocumentPdf} from "@/domain/academic-document-pdf.server";
const example={title:"OFFICIAL ACADEMIC TRANSCRIPT",issuer:"CAN Academy",student:"Alex Student",identifier:"test-123",issuedAt:"2026-10-31",lines:["Mathematics | A | 1 credit"]};
describe("official academic PDF rendering",()=>{
 it("renders institutional header and document identity",()=>{
  const pdf=Buffer.from(academicDocumentPdf(example)).toString("ascii");
  expect(pdf.startsWith("%PDF-1.4")).toBe(true);
  expect(pdf).toContain("CAN Academy");
  expect(pdf).toContain("Alex Student");
  expect(pdf).toContain("Credential test-123");
  expect(pdf).toContain("%%EOF");
 });
 it("escapes parentheses and backslashes",()=>{
  const pdf=Buffer.from(academicDocumentPdf({...example,student:"Alex (A) \\ Student"})).toString("ascii");
  expect(pdf).toContain("Alex \\(A\\) \\\\ Student");
 });
 it("paginates long transcript records",()=>{
  const pdf=Buffer.from(academicDocumentPdf({...example,lines:Array.from({length:90},(_,i)=>"Course "+i)})).toString("ascii");
  expect(pdf).toContain("/Count 3");
  expect(pdf).toContain("Course 89");
 });
 it("rejects unsupported scripts rather than altering official names",()=>{
  expect(()=>academicDocumentPdf({...example,student:"\u674e"})).toThrow("Unicode");
 });
});

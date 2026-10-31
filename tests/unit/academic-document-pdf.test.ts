import { describe,expect,it } from "vitest";
import { academicDocumentPdf } from "@/domain/academic-document-pdf.server";

const example={title:"OFFICIAL ACADEMIC TRANSCRIPT",issuer:"CAN Academy",student:"Alex Student",identifier:"test-123",issuedAt:"2026-10-31",lines:["Mathematics | A | 1 credit"]};
describe("official academic PDF rendering",()=>{
 it("creates a complete PDF with xref and document text",()=>{
  const pdf=Buffer.from(academicDocumentPdf(example)).toString("ascii");
  expect(pdf.startsWith("%PDF-1.4")).toBe(true);
  expect(pdf).toContain("xref\n0 6");
  expect(pdf).toContain("Alex Student");
  expect(pdf).toContain("%%EOF");
 });
 it("escapes parentheses and backslashes in PDF content",()=>{
  const pdf=Buffer.from(academicDocumentPdf({...example,student:"Alex (A) \\ Student"})).toString("ascii");
  expect(pdf).toContain("Alex \\(A\\) \\\\ Student");
 });
 it("refuses unsupported characters rather than corrupting legal names",()=>{
  expect(()=>academicDocumentPdf({...example,student:"José"})).toThrow("Unicode");
 });
 it("refuses overflow",()=>{
  expect(()=>academicDocumentPdf({...example,lines:Array.from({length:50},(_,i)=>String(i))})).toThrow("printable bounds");
 });
});

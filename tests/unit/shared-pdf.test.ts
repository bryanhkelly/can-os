import { describe,expect,it } from "vitest";
import { renderPdfDocument } from "@/platform/documents/pdf.server";
describe("shared PDF platform",()=>{
 it("renders PDF with valid page and cross-reference structure",()=>{
  const pdf=Buffer.from(renderPdfDocument({title:"A report",lines:["Hello (team)"]})).toString("ascii");
  expect(pdf.startsWith("%PDF-1.4")).toBe(true);
  expect(pdf).toContain("/Count 1");
  expect(pdf).toContain("Hello \\(team\\)");
  expect(pdf).toContain("%%EOF");
 });
 it("paginates long documents",()=>{
  const pdf=Buffer.from(renderPdfDocument({title:"Long report",lines:Array.from({length:100},(_,i)=>"Record "+i)})).toString("ascii");
  expect(pdf).toContain("/Count 3");
  expect(pdf).toContain("Record 99");
 });
 it("fails closed on unsupported glyphs and oversized lines",()=>{
  expect(()=>renderPdfDocument({title:"José",lines:[]})).toThrow("Unicode");
  expect(()=>renderPdfDocument({title:"Report",lines:["x".repeat(100)]})).toThrow("printable");
 });
});

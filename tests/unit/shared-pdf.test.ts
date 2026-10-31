import {describe,expect,it} from "vitest";
import {renderPdfDocument} from "@/platform/documents/pdf.server";
describe("shared PDF platform",()=>{
 it("renders branded PDF with headers, footers and xref",()=>{
  const pdf=Buffer.from(renderPdfDocument({title:"A report",brand:{name:"CAN Academy"},footer:"Confidential",lines:["Hello (team)"]})).toString("ascii");
  expect(pdf.startsWith("%PDF-1.4")).toBe(true);
  expect(pdf).toContain("/Count 1");
  expect(pdf).toContain("CAN Academy");
  expect(pdf).toContain("Confidential");
  expect(pdf).toContain("Hello \\(team\\)");
  expect(pdf).toContain("%%EOF");
 });
 it("paginates long documents with repeated titles",()=>{
  const pdf=Buffer.from(renderPdfDocument({title:"Long report",lines:Array.from({length:100},(_,i)=>"Record "+i)})).toString("ascii");
  expect(pdf).toContain("/Count 3");
  expect(pdf).toContain("Record 99");
  expect(pdf).toContain("Page 3 of 3");
 });
 it("wraps long paragraphs without dropping words",()=>{
  const pdf=Buffer.from(renderPdfDocument({title:"Report",lines:[Array.from({length:30},()=> "academic").join(" ")]})).toString("ascii");
  expect((pdf.match(/academic/g)??[]).length).toBe(30);
 });
 it("supports Latin names and typographic punctuation using WinAnsi",()=>{
  const pdf=Buffer.from(renderPdfDocument({title:"Report",lines:["Jos\u00e9 O\u2019Connor"]})).toString("ascii");
  expect(pdf).toContain("Jos\\351 O\\222Connor");
 });
 it("rejects scripts requiring embedded fonts rather than corrupting legal names",()=>{
  expect(()=>renderPdfDocument({title:"\u674e",lines:[]})).toThrow("Unicode");
 });
});

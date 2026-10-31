import { describe,expect,it } from "vitest";
import { deflateRawSync } from "node:zlib";
import { inspectCommonCartridgeManifest,inspectCommonCartridgeZip,extractCommonCartridgeWebLink,extractCommonCartridgeStaticLesson } from "@/domain/common-cartridge";

const xml=`<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns="http://www.imsglobal.org/xsd/imsccv1p3/imscp_v1p1">
 <organizations>
  <organization identifier="ORG-1">
   <item identifier="I-1" identifierref="R-1"><title>Cell &amp; tissue</title></item>
   <item identifier="I-2" identifierref="R-QTI"><title>Quiz</title></item>
  </organization>
 </organizations>
 <resources>
  <resource identifier="R-1" type="webcontent" href="content/index.html">
   <file href="content/index.html" />
  </resource>
  <resource identifier="R-QTI" type="imsqti_xmlv1p2" href="assessments/quiz.xml"/>
 </resources>
</manifest>`;
function zipEntry(name:string,source:string):Uint8Array{
 const data=Buffer.from(source,"utf8");
 const deflated=deflateRawSync(data);
 function crc32(bytes:Uint8Array){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let j=0;j<8;j++)crc=crc&1?(crc>>>1)^0xedb88320:crc>>>1;}return(crc^0xffffffff)>>>0;}
 const crc=crc32(data);
 const filename=Buffer.from(name);
 const local=Buffer.alloc(30+filename.length);
 local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(8,8);
 local.writeUInt32LE(crc,14);local.writeUInt32LE(deflated.length,18);local.writeUInt32LE(data.length,22);
 local.writeUInt16LE(filename.length,26);filename.copy(local,30);
 const dir=Buffer.alloc(46+filename.length);
 dir.writeUInt32LE(0x02014b50,0);dir.writeUInt16LE(20,4);dir.writeUInt16LE(20,6);
 dir.writeUInt16LE(8,10);dir.writeUInt32LE(crc,16);dir.writeUInt32LE(deflated.length,20);
 dir.writeUInt32LE(data.length,24);dir.writeUInt16LE(filename.length,28);
 filename.copy(dir,46);
 const end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);
 end.writeUInt32LE(dir.length,12);end.writeUInt32LE(local.length+deflated.length,16);
 return Buffer.concat([local,deflated,dir,end]);
}
describe("Common Cartridge bounded import preview",()=>{
 it("preserves publisher identifiers and course outline; reports unsupported QTI adapter rather than dropping questions",()=>{
  const parsed=inspectCommonCartridgeManifest(xml);
  expect(parsed.profile).toBe("common_cartridge");
  expect(parsed.resources.map(r=>r.identifier)).toEqual(["R-1","R-QTI"]);
  expect(parsed.outline[0].title).toBe("Cell & tissue");
  expect(parsed.resources[0].files).toEqual(["content/index.html"]);
  expect(parsed.notices.join(" ")).toContain("R-QTI");
 });
 it("reads an actual deflated IMSCC ZIP manifest",()=>{
  const parsed=inspectCommonCartridgeZip(zipEntry("imsmanifest.xml",xml));
  expect(parsed.outline[1].title).toBe("Quiz");
 });
 it("only extracts integrity-checked HTTPS IMS web links",()=>{
  const xmlLink='<webLink><title>Algebra &amp; practice</title><url href="https://example.org/lesson"/></webLink>';
  const archive=zipEntry("links/lesson.xml",xmlLink);
  expect(extractCommonCartridgeWebLink(archive,"links/lesson.xml")).toEqual({
    title:"Algebra & practice",url:"https://example.org/lesson",
  });
  expect(()=>extractCommonCartridgeWebLink(archive,"links/missing.xml")).toThrow("missing");
  expect(()=>extractCommonCartridgeWebLink(zipEntry("links/lesson.xml",
    xmlLink.replace("https://","http://")),"links/lesson.xml")).toThrow("HTTPS");
  expect(()=>extractCommonCartridgeWebLink(zipEntry("links/lesson.xml",
    '<webLink><url href="https://127.0.0.1/admin"/></webLink>'),"links/lesson.xml")).toThrow("HTTPS");
  const corrupted=archive.slice();
  corrupted[35]^=1;
  expect(()=>extractCommonCartridgeWebLink(corrupted,"links/lesson.xml")).toThrow();
 });
 it("rejects path traversal and external entity declarations",()=>{
  expect(()=>inspectCommonCartridgeManifest(xml.replace("content/index.html","../secrets"))).toThrow("Unsafe");
  expect(()=>inspectCommonCartridgeManifest(`<!DOCTYPE manifest [<!ENTITY x SYSTEM "file:///etc/passwd">]>`+xml)).toThrow("unsafe");
  expect(()=>inspectCommonCartridgeZip(zipEntry("../imsmanifest.xml",xml))).toThrow("Unsafe");
 });
 it("rejects ZIP corruption, unsupported lengths and duplicate resource IDs",()=>{
  const corrupted=zipEntry("imsmanifest.xml",xml).slice();
  corrupted[corrupted.length-23]^=1;
  expect(()=>inspectCommonCartridgeZip(corrupted)).toThrow();
  expect(()=>inspectCommonCartridgeManifest(xml.replace('identifier="R-QTI"','identifier="R-1"'))).toThrow("duplicate");
 });
});

describe("Common Cartridge conservative static lesson",()=>{
 const entry={identifier:"lesson-1",type:"webcontent",href:"lessons/a.html",files:["lessons/a.html"]};
 it("extracts a small text-only instructional lesson",()=>{
  const file=zipEntry("lessons/a.html","<html><body><h1>Cells</h1><p>Study the cell.</p></body></html>");
  expect(extractCommonCartridgeStaticLesson(file,entry).title).toBe("Cells");
 });
 it("rejects scripts, events, linked assets and duplicate or missing manifest files",()=>{
  for(const html of ['<script>alert(1)</script>','<p onclick="run()">Bad</p>',
   '<img src="a.png">','<a href="https://example.com">Click</a>','<p>&#60;script&gt;</p>']){
   expect(()=>extractCommonCartridgeStaticLesson(zipEntry("lessons/a.html",html),entry)).toThrow();
  }
  expect(()=>extractCommonCartridgeStaticLesson(zipEntry("lessons/a.html","<p>ok</p>"),
   {...entry,files:["lessons/a.html","lessons/b.css"]})).toThrow();
  expect(()=>extractCommonCartridgeStaticLesson(zipEntry("different.html","<p>ok</p>"),entry)).toThrow();
 });
 it("rejects unsupported executable assessment resources",()=>{
  expect(()=>extractCommonCartridgeStaticLesson(zipEntry("lessons/a.html","<p>quiz</p>"),
   {...entry,type:"imsqti_xmlv1p2"})).toThrow("webcontent");
 });
});

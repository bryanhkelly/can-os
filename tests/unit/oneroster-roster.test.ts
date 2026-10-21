import { describe, expect, it } from "vitest";
import { exportOneRoster12Roster, type OneRosterInput } from "@/domain/oneroster-roster";
import { zipRosterFiles } from "@/domain/oneroster-zip";

const school="f1000000-0000-4000-8000-000000000002";
const year="f1000000-0000-4000-8000-000000000009";
const term="f1000000-0000-4000-8000-000000000010";
const course="123e4567-e89b-42d3-a456-426614174000";
const section="123e4567-e89b-42d3-a456-426614174001";
const student="123e4567-e89b-42d3-a456-426614174002";
const teacher="123e4567-e89b-42d3-a456-426614174003";
const enrollment="123e4567-e89b-42d3-a456-426614174004";
const assignment="123e4567-e89b-42d3-a456-426614174005";
const model:OneRosterInput={
 organization:{id:school,name:"Demo School"},
 sessions:[
  {id:year,title:"2026–27",type:"schoolYear",startsOn:"2026-08-17",endsOn:"2027-06-04"},
  {id:term,title:"Fall 2026",type:"term",startsOn:"2026-08-17",endsOn:"2026-12-18",parentId:year},
 ],
 courses:[{id:course,title:"Algebra I",code:"ALG1",subject:"Math"}],
 classes:[{id:section,title:"Algebra I",code:"ALG1-F",courseId:course,termId:term}],
 people:[
  {id:student,givenName:"=HYPERLINK(\"bad\")",familyName:"Test",grade:"9"},
  {id:teacher,givenName:"Riley",familyName:"Teacher"},
 ],
 registrations:[
  {id:enrollment,classId:section,personId:student,role:"student"},
  {id:assignment,classId:section,personId:teacher,role:"teacher"},
 ],
};

describe("1EdTech OneRoster 1.2 roster bulk export",()=>{
 it("emits a versioned manifest and valid referentially linked CSV files",()=>{
   const files=exportOneRoster12Roster(model);
   expect(Object.keys(files)).toHaveLength(8);
   expect(files["manifest.csv"]).toContain("oneroster.version,1.2");
   expect(files["manifest.csv"]).toContain("file.enrollments,bulk");
   expect(files["manifest.csv"]).toContain("file.lineItems,absent");
   expect(files["classes.csv"]).toContain(course);
   expect(files["enrollments.csv"]).toContain(student);
   expect(files["roles.csv"]).toContain("teacher");
   expect(files["users.csv"]).not.toContain("password123");
   expect(files["users.csv"]).toContain("'=HYPERLINK");
 });
 it("rejects foreign keys to another school rather than exporting cross-tenant data",()=>{
   expect(()=>exportOneRoster12Roster({...model,classes:[{...model.classes[0]!,courseId:teacher}]})).toThrow("unknown course");
   expect(()=>exportOneRoster12Roster({...model,registrations:[{...model.registrations[0]!,personId:course}]})).toThrow("unknown class or user");
   expect(()=>exportOneRoster12Roster({...model,people:[model.people[0]!,model.people[0]!]})).toThrow("Duplicate");
 });
 it("creates a bounded ZIP32 archive containing the CSV files and central directory",()=>{
   const archive=zipRosterFiles(exportOneRoster12Roster(model));
   const view=new DataView(archive.buffer,archive.byteOffset,archive.byteLength);
   expect(view.getUint32(0,true)).toBe(0x04034b50);
   expect(view.getUint32(archive.length-22,true)).toBe(0x06054b50);
   expect(view.getUint16(archive.length-22+10,true)).toBe(8);
   expect(()=>zipRosterFiles({"../manifest.csv":"bad"})).toThrow("Invalid");
 });
});

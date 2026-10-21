import {describe,it,expect} from "vitest";
import {previewOneRosterCsv,previewOneRosterBundle} from "@/domain/oneroster-csv";
const orgs="sourcedId,name,type\nschool-1,Valor School,school\n";
const users="sourcedId,enabledUser,givenName,familyName,role\nlearner-1,true,Jordan,Student,student\n";
const courses="sourcedId,title,orgSourcedId\nmath-1,Algebra I,school-1\n";
const classes="sourcedId,title,courseSourcedId,classCode,schoolSourcedId\nsection-1,Algebra I,math-1,ALG-1,school-1\n";
const enrollments="sourcedId,classSourcedId,schoolSourcedId,userSourcedId,role\nenrollment-1,section-1,school-1,learner-1,student\n";
describe("OneRoster CSV interchange validation",()=>{
 it("parses quoted commas and newlines without creating school records",()=>{
  const csv='sourcedId,name,type\norg-1,"A school, with campuses",school\norg-2,"A new\nline",school';
  const p=previewOneRosterCsv("orgs",csv);
  expect(p.rows).toHaveLength(2);
  expect(p.rows[0]?.name).toBe("A school, with campuses");
  expect(p.rows[1]?.name).toContain("\n");
 });
 it("rejects duplicated IDs and nonportable malformed rows",()=>{
  expect(previewOneRosterCsv("orgs",orgs+"school-1,Duplicate,school\n").errors.join(" ")).toContain("duplicate sourcedId");
  expect(previewOneRosterCsv("orgs","sourcedId,name\norg,A")).toThrow("required columns");
  expect(previewOneRosterCsv("orgs","sourcedId,name,type\norg,Unclosed,school,extra").errors).toHaveLength(1);
  expect(()=>previewOneRosterCsv("orgs",'sourcedId,name,type\norg,"Broken,school')).toThrow("Unclosed");
  expect(()=>previewOneRosterCsv("orgs","sourcedId,name,type\nschool,,")).not.toThrow();
 });
 it("keeps cross-file relationships visible and reports missing identifiers",()=>{
  const good=previewOneRosterBundle({orgs,users,courses,classes,enrollments});
  expect(good.valid).toBe(true);
  const bad=previewOneRosterBundle({orgs,users,courses,classes,enrollments:enrollments.replace("learner-1","stranger")});
  expect(bad.valid).toBe(false);
  expect(bad.warnings[0]).toContain("userSourcedId");
 });
 it("rejects dangerous parser envelopes",()=>{
  expect(()=>previewOneRosterCsv("orgs","sourcedId,name,type\n"+"a".repeat(2_000_001))).toThrow("2MB");
  expect(()=>previewOneRosterCsv("orgs","sourcedId,sourcedId,type\na,b,c")).toThrow("unique");
 });
});

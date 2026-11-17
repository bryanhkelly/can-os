import {describe,expect,it} from "vitest";
import {activityEvidenceLinks} from "@/domain/activity-evidence-navigation";
import type {ParticipationRecord} from "@/domain/participation-read-model";
const record=(source:ParticipationRecord["source"],status:ParticipationRecord["status"],
 subject:ParticipationRecord["subject"]["kind"]="self"):ParticipationRecord=>({
 key:source+":enrollment",source,sourceId:"enrollment",
 refs:{sectionId:"section-1",classId:"class-1",studentPersonId:"dependent-person-1"},
 kind:"learning",bucket:status==="active"?"current":"history",status,
 sourceStatus:status,title:"Example",detail:null,organizationName:null,organizationId:null,
 siteName:null,siteId:null,subject:{kind:subject,displayName:null},
 startAt:null,endAt:null,nextAt:null,progress:null,outcome:null,action:null,
});
describe("My Activity source-owned outcome navigation",()=>{
 it("retains school history links to authorized assessment and grade views",()=>{
  const links=activityEvidenceLinks(record("school_section","withdrawn"),"student");
  expect(links.map(row=>row.href)).toEqual([
   "/student/assignments?section=section-1","/student/report-card"]);
  expect(links.every(row=>!row.href.includes("lesson"))).toBe(true);
 });
 it("guardian and staff navigation never get student-only links",()=>{
  expect(activityEvidenceLinks(record("school_section","completed","dependent"),"guardian")
   .map(row=>row.href)).toContain("/guardian/attendance?student=dependent-person-1");
  expect(activityEvidenceLinks(record("school_section","active"),"network_admin")).toEqual([]);
  expect(activityEvidenceLinks(record("school_section","active","dependent"),"student")).toEqual([]);
 });
 it("withdrawn native classes never acquire learning access through history",()=>{
  expect(activityEvidenceLinks(record("native_class","withdrawn"),"student")).toEqual([]);
  expect(activityEvidenceLinks(record("native_class","active"),"student").length).toBe(2);
 });
 it("completion links to the issuer's independently authorized credential view",()=>{
  expect(activityEvidenceLinks(record("noncredit_course","completed"),"account_holder"))
   .toEqual([{label:"Issued certificates & badges",href:"/canonical/my-credentials"}]);
 });
});

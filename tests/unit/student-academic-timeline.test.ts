import {describe,expect,it} from "vitest";
import {studentAcademicTimeline} from "@/domain/student-academic-timeline";

describe("Student 360 academic timeline",()=>{
  it("sorts only academic evidence chronologically while excluding private support actions",()=>{
    const rows=studentAcademicTimeline({
      sections:[{sectionId:"section-A",title:"Algebra I"}],
      grades:[{sectionId:"section-A",letterGrade:"A",finalizedAt:new Date("2026-10-15T10:00:00Z")}],
      attendance:[{status:"absent",expectedAt:new Date("2026-10-12T10:00:00Z"),sectionTitle:"Algebra I"}],
      actions:[
        {id:"private",type:"support_referral",title:"Sensitive referral",status:"open",createdAt:new Date("2026-10-20T10:00:00Z")},
        {id:"parent",type:"guardian_grade_follow_up",title:"Guardian's grade question",status:"resolved",createdAt:new Date("2026-10-18T10:00:00Z")},
        {id:"academic",type:"academic_intervention",title:"Academic support",status:"waiting",createdAt:new Date("2026-10-11T10:00:00Z")},
      ],
    });
    expect(rows.map(r=>r.kind)).toEqual(["action","grade","attendance","action"]);
    expect(rows.map(r=>r.title).join(" ")).not.toMatch(/Sensitive referral|Guardian's grade question/);
    expect(rows[1]?.detail).toContain("A");
    expect(rows[0]?.detail).toContain("resolved");
  });
  it("does not manufacture academic activity without evidence",()=>{
    expect(studentAcademicTimeline({sections:[],grades:[],attendance:[],actions:[]})).toEqual([]);
  });
  it("omits unfinalized grades",()=>{
    expect(studentAcademicTimeline({
      sections:[{sectionId:"A",title:"Class"}],
      grades:[{sectionId:"A",letterGrade:"A",finalizedAt:null}],
      attendance:[],actions:[],
    })).toEqual([]);
  });
});

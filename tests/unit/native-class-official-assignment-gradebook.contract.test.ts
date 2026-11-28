import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
const read=(path:string)=>readFileSync(path,"utf8");
describe("official native Class assignment and gradebook boundaries",()=>{
  const draft=read("src/modules/learning/native-course-draft.functions.ts");
  const release=read("src/modules/learning/native-offering-release.functions.ts");
  const gradebook=read("src/modules/classes/native-class-gradebook.functions.ts");
  it("uses the existing appointed draft author and exact Course lock",()=>{
    const author=draft.slice(draft.indexOf("export const createNativeCourseAssignmentDraft"));
    expect(author).toContain("requireAssignedNativeDraft(tx,actor,data.courseVersionId,true)");
    expect(author).toContain("tx.insert(officialCourseAssignmentVersions)");
    expect(author).toContain("INSERT INTO public.graded_assignments");
    expect(author).toContain("curriculum.native_draft_assignment.create");
    expect(author).not.toContain('lifecycle:"published"');
    expect(author).not.toContain("INSERT INTO public.grading_decisions");
  });
  it("binds requirements, delivery and grading policy to the exact independently reviewed snapshot",()=>{
    expect(release).toContain("assignments:assignments.filter");
    expect(release).toContain("deliveryAssignments:deliveryAssignments.filter");
    expect(release).toContain("gradingPolicies:gradingPolicyRows.filter");
    expect(release).toContain("curriculum.native_draft_assignment.create");
    expect(release).toContain("reviewerPersonIds.has(change.actorPersonId)");
    expect(release).toContain("assignments:bundle.assignments.filter");
  });
  it("reads official decisions only for a currently authorized Class",()=>{
    expect(gradebook).toContain("assertNativeClassTeacher(tx,actor,data.classId)");
    expect(gradebook).toContain("nativeClassWorkRows([cls.id])");
    expect(gradebook).toContain("public.grading_decisions");
    expect(gradebook).toContain("successor.supersedes_decision_id=g.id");
    expect(gradebook).toContain("heads>1");
    expect(gradebook).toContain("heads>0&&row.practice_only");
    expect(gradebook).toContain("canRecordOfficialGrade:false");
    expect(gradebook).not.toContain("INSERT INTO");
    expect(gradebook).not.toContain("practiceScore");
  });
});

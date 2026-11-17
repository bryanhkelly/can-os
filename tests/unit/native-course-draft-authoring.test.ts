import { describe,expect,it } from "vitest";
import { readFileSync } from "node:fs";
import {
  nativeCourseLessonEditableSchema,readEditableNativeLesson,
  saveNativeCourseLessonDraftSchema,
} from "@/domain/native-course-lesson-draft";

const source=(path:string)=>readFileSync(path,"utf8");
const versionId="ca270000-0000-4000-8000-000000000042";
const lessonId="ca270000-0000-4000-8000-000000000044";
const editable={title:"Ask Better Questions",
  objectives:["Write a prompt for an audience"],
  segments:[{title:"Welcome",minutes:5},{title:"Practice",minutes:25}]};

describe("native Course draft authoring",()=>{
  it("reads existing structured lessons without discarding other publisher metadata",()=>{
    expect(readEditableNativeLesson(editable.title,{
      ...editable,synthetic:true,mediaStatus:"not_uploaded",
      requiresIndependentReview:true,
    })).toEqual(editable);
    expect(readEditableNativeLesson("Unknown",{answers:["private"]})).toBeNull();
    expect(readEditableNativeLesson("Unknown",[])).toBeNull();
  });

  it("bounds objectives, duration and draft-only client-editable fields",()=>{
    expect(nativeCourseLessonEditableSchema.safeParse(editable).success).toBe(true);
    expect(nativeCourseLessonEditableSchema.safeParse({
      ...editable,segments:[{title:"Huge segment",minutes:90},
        {title:"Another segment",minutes:90},{title:"Over the limit",minutes:5}],
    }).success).toBe(false);
    expect(saveNativeCourseLessonDraftSchema.safeParse({
      courseVersionId:versionId,lessonId,expectedRevision:"a".repeat(64),...editable,
      mediaStatus:"published",
    }).success).toBe(false);
    expect(saveNativeCourseLessonDraftSchema.safeParse({
      courseVersionId:versionId,lessonId,expectedRevision:"a".repeat(64),...editable,
    }).success).toBe(true);
  });

  it("revalidates the Course-specific appointment on read and write",()=>{
    const service=source("src/modules/learning/native-course-draft.functions.ts");
    expect(service).toContain("getCommandContext(getRequest())");
    expect(service).toContain("assertTrackProvider(tx,actor");
    expect(service).toContain('capability:"instructional_track.author"');
    expect(service).toContain('eq(courseVersions.lifecycle,"draft")');
    expect(service).toContain('requireAssignedNativeDraft(tx,actor,data.courseVersionId,true)');
    expect(service).toContain('eq(courseLessons.courseVersionId,data.courseVersionId)');
    expect(service).toContain('if(currentRevision!==data.expectedRevision)');
    expect(service).toContain('.for("update")');
    expect(service).toContain("writeAudit(tx,actor");
    expect(service).toContain("...(lesson.content as JsonObject)");
    expect(service).not.toContain('lifecycle:"published"');
  });

  it("only authorized creators see native draft versions, not reviewer inventories",()=>{
    const workspace=source("src/modules/learning/provider-content-workspace.functions.ts");
    const home=source("src/components/learning/ProviderInstructionHome.tsx");
    const editor=source("src/components/learning/NativeCourseDraftEditor.tsx");
    expect(workspace).toContain('role === "academic_content_creator"');
    expect(workspace).toContain('version.lifecycle === "draft"');
    expect(home).toContain("<NativeCourseDraftEditor versions={draftVersions}/>");
    expect(home).toContain('import("@/components/learning/NativeCourseDraftEditor")');
    expect(editor).toContain("<WorkspacePanel");
    expect(editor).toContain("<MutationFeedback");
    expect(editor).toContain("saveNativeCourseLessonDraft");
    expect(editor).toContain("expectedRevision:lesson.revision");
    expect(editor).not.toContain("publishCourseVersion");
    expect(editor).not.toContain("update(courseVersions)");
  });
});

import type { ComponentProps, ReactNode } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClassWorkspace } from "@/routes/classes";
import { TeacherDiscussionsView } from "@/routes/teacher.discussions";
import { Route as StudentDiscussions } from "@/routes/student.discussions";
import { classContentSchema } from "@/domain/class-content";

const state = vi.hoisted(() => ({ search: {} as Record<string, unknown>, data: null as unknown }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options, useSearch: () => state.search, useLoaderData: () => state.data }),
  useRouter: () => ({ invalidate: vi.fn() }),
  Link: ({ to, search, params, children, ...props }: {
    to: string; search?: Record<string, string | undefined>; params?: Record<string, string>; children: ReactNode;
  }) => {
    const path = to.replace(/\$([^/]+)/g, (_, key: string) => params?.[key] ?? key);
    const query = new URLSearchParams(Object.entries(search ?? {}).filter((entry): entry is [string, string] => entry[1] !== undefined)).toString();
    return <a href={path + (query ? "?" + query : "")} {...props}>{children}</a>;
  },
}));
vi.mock("@/modules/learning/class-workspace.functions", () => ({
  getClassDirectory: vi.fn(), getClassWorkspace: vi.fn(), getClassResourceDownload: vi.fn(), setLessonCompletion: vi.fn(),
}));
vi.mock("@/modules/learning/class-communication.functions", () => ({ publishClassAnnouncement: vi.fn() }));
vi.mock("@/modules/learning/class-supplements.functions", () => ({ addClassSupplement: vi.fn() }));
vi.mock("@/modules/learning/discussion-teacher-query.functions", () => ({ getTeacherCourseDiscussions: vi.fn() }));
vi.mock("@/modules/learning/discussion-teacher.functions", () => ({
  createCourseDiscussion: vi.fn(), setCourseDiscussionLock: vi.fn(), moderateDiscussionMessage: vi.fn(),
}));
vi.mock("@/modules/learning/course-discussions.functions", () => ({ getCourseDiscussions: vi.fn() }));
vi.mock("@/modules/learning/discussion-post.functions", () => ({ postDiscussionMessage: vi.fn() }));

const workspace: ComponentProps<typeof ClassWorkspace>["data"] = {
  role: "student", section: { id: "english", title: "English", code: "ENG", description: "Read and revise.",
    subject: "English", versionId: "published-version", contentStatus: "published" },
  teacherGuides: null, lessonCompletionCounts:[],curriculumAccess:{available:true,reason:null},
  studentPersonId: "child", teachers: [{ personId: "teacher", name: "Taylor Teacher" }],
  content: classContentSchema.parse({
    version: 1, syllabus: "<script>unsafe()</script>",
    modules: [{ id: "reading", title: "Close reading", lessons: [{ id: "evidence", title: "Find evidence",
      body: "<img src=x onerror=unsafe()>", resources: [] }] }],
    resources: [{ id: "library", title: "Library", url: "https://www.loc.gov/" }, { id: "private",
      title: "Private reading", documentId: "10000000-0000-4000-8000-000000000001" }],
  }),
  progress: [], roster: [{ personId: "child", profileId: "profile", name: "Jordan Student", completedLessons: 0 }],
  announcements: [{ id: "announcement", title: "Reading notes", body: "Bring your notes.", createdAt: "2026-10-01T12:00:00Z" }],
};
beforeEach(() => { state.search = {}; state.data = null; });

describe("published class workspace", () => {
  it("opens exact class lessons and keeps progress separate from grades and attendance", () => {
    const html = renderToStaticMarkup(<ClassWorkspace data={{ ...workspace, roster: [] }}/>);
    expect(html).toContain('href="/classes?section=english&amp;tab=lessons"');
    expect(html).toContain("0 / 1 published lessons");
    expect(html).toContain("not a grade, mastery score or attendance record");
    expect(html).toContain('href="/student/assignments?section=english"');
    expect(html).not.toContain("Jordan Student");
    expect(html).not.toContain("Roster");
    expect(html).not.toMatch(/Create class|Edit lesson|Live room|Recording/);
  });
  it("instruments only the real published lesson and resource controls for student telemetry", () => {
    const source = { id: "source-1", title: "Evidence source", url: "https://www.loc.gov/" };
    const lesson = {
      ...workspace.content!.modules[0]!.lessons[0]!,
      body: "Read the source and take notes.",
      resources: [source],
      activities: [{ id: "self-check", title: "Check your reasoning",
        kind: "self_check" as const, instructions: "Write down two supporting examples." }],
    };
    const data = { ...workspace, content: { ...workspace.content!,
      modules: [{ ...workspace.content!.modules[0]!, lessons: [lesson] }],
    }};
    const student = renderToStaticMarkup(<ClassWorkspace data={data} tab="lessons" lessonId="evidence" />);
    expect(student).toContain("Learning activity");
    expect(student).toContain('data-learning-content="true"');
    expect(student).toContain('data-learning-resource-id="source-1"');
    expect(student).toContain("Evidence source");
    const guardian = renderToStaticMarkup(<ClassWorkspace data={{ ...data, role: "guardian" }} tab="lessons" lessonId="evidence" />);
    expect(guardian).not.toContain('aria-label="Learning activity"');
    expect(guardian).toContain("Evidence source");
    const overview = renderToStaticMarkup(<ClassWorkspace data={data} tab="overview" />);
    expect(overview).not.toContain('aria-label="Learning activity"');
  });
  it("supports first, middle, and final published lesson navigation without altering completion",()=>{
    const data={...workspace,content:{...workspace.content!,modules:[{...workspace.content!.modules[0]!,
     lessons:[...workspace.content!.modules[0]!.lessons,
      {id:"middle",title:"Middle lesson",body:"Learn the next step.",resources:[]},
      {id:"final",title:"Final lesson",body:"Course wrap-up.",resources:[]}]}]}};
    const first=renderToStaticMarkup(<ClassWorkspace data={data} tab="lessons" lessonId="evidence"/>);
    expect(first).toContain("Lesson 1 of 3");
    expect(first).toContain("Beginning of course");
    expect(first).toContain('href="/classes?section=english&amp;tab=lessons&amp;lesson=middle"');
    const middle=renderToStaticMarkup(<ClassWorkspace data={data} tab="lessons" lessonId="middle"/>);
    expect(middle).toContain("Lesson 2 of 3");
    expect(middle).toContain('href="/classes?section=english&amp;tab=lessons&amp;lesson=evidence"');
    expect(middle).toContain('href="/classes?section=english&amp;tab=lessons&amp;lesson=final"');
    const last=renderToStaticMarkup(<ClassWorkspace data={data} tab="lessons" lessonId="final"/>);
    expect(last).toContain("End of published course");
    expect(last).toContain("Navigation never marks lessons complete");
  });
  it("skips empty outlines in lesson navigation, recommendations and completion totals",()=>{
    const outline={id:"outline",title:"Future outline",body:" ",resources:[]};
    const real=workspace.content!.modules[0]!.lessons[0]!;
    const next={id:"next-real",title:"Next reading",body:"Read the next passage.",resources:[]};
    const data={...workspace,content:{...workspace.content!,modules:[{
      ...workspace.content!.modules[0]!,lessons:[real,outline,next],
    }]},progress:[{lessonId:real.id,completedAt:"2026-10-29"},{lessonId:outline.id,completedAt:"2026-10-29"}]};
    const overview=renderToStaticMarkup(<ClassWorkspace data={data}/>);
    expect(overview).toContain("1 / 2 published lessons");
    expect(overview).toContain('href="/classes?section=english&amp;tab=lessons&amp;lesson=next-real"');
    const current=renderToStaticMarkup(<ClassWorkspace data={data} tab="lessons" lessonId={real.id}/>);
    expect(current).toContain("Lesson 1 of 2");
    expect(current).not.toContain("lesson=outline");
    const index=renderToStaticMarkup(<ClassWorkspace data={data} tab="lessons"/>);
    expect(index).not.toContain("Future outline");
    const planning=renderToStaticMarkup(<ClassWorkspace data={{...data,role:"teacher"}} tab="planning"/>);
    expect(planning).toContain("Future outline");
    expect(planning).toContain("Outline only");
  });
  it("explains unavailable publisher content while keeping academic navigation available",()=>{
    const data={...workspace,content:null,curriculumAccess:{available:false,reason:"An active publisher license is required."}};
    const html=renderToStaticMarkup(<ClassWorkspace data={data} tab="lessons"/>);
    expect(html).toContain("An active publisher license is required");
    expect(html).toContain("academic records remain available");
    expect(html).not.toContain("Mark lesson complete");
  });
  it("allows only students to mark a lesson and safely renders lesson text", () => {
    const student = renderToStaticMarkup(<ClassWorkspace data={workspace} tab="lessons" lessonId="evidence"/>);
    expect(student).toContain("Mark lesson complete");
    expect(student).toContain("&lt;img");
    expect(student).not.toContain("<img");
    for (const role of ["teacher", "guardian"]) {
      expect(renderToStaticMarkup(<ClassWorkspace data={{ ...workspace, role }} tab="lessons" lessonId="evidence"/>))
        .not.toContain("Mark lesson complete");
    }
  });
  it("keeps publisher reading visible alongside activities and never interprets it as HTML",()=>{
    const lesson={...workspace.content!.modules[0]!.lessons[0]!,
      body:"<script>Reading belongs in the lesson</script>",
      activities:[{id:"practice",kind:"guided_practice" as const,title:"Solve carefully",
        instructions:"Explain how you solved the equation.",evidence:"teacher_review" as const}]};
    const data={...workspace,content:{...workspace.content!,
      modules:[{...workspace.content!.modules[0]!,lessons:[lesson]}]}};
    const html=renderToStaticMarkup(<ClassWorkspace data={data} tab="lessons" lessonId="evidence"/>);
    expect(html).toContain("Lesson reading");
    expect(html).toContain("Learning activities");
    expect(html).toContain("&lt;script&gt;Reading belongs in the lesson&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Solve carefully");
    expect(html).toContain("Explain how you solved the equation.");
  });
  it("student sees only published work for the selected lesson; teacher gets linked create actions",()=>{
    const evidence=[
      {id:"hw1",title:"Find evidence homework",unitId:null,curriculumLessonId:"evidence",
       attemptNumber:1,status:"not_submitted" as const,score:null,pointsPossible:10},
      {id:"other",title:"Unrelated course task",unitId:null,curriculumLessonId:"other-lesson",
       attemptNumber:1,status:"submitted" as const,score:null,pointsPossible:10},
    ];
    const data={...workspace,assessmentEvidence:evidence};
    const student=renderToStaticMarkup(<ClassWorkspace data={data} tab="lessons" lessonId="evidence"/>);
    expect(student).toContain("Assignments for this lesson");
    expect(student).toContain("Find evidence homework");
    expect(student).toContain('href="/student/assignments?section=english&amp;assessment=hw1"');
    expect(student).not.toContain("Unrelated course task");
    expect(student).not.toContain("Create homework");
    const teacher=renderToStaticMarkup(<ClassWorkspace data={{...data,role:"teacher"}} tab="lessons" lessonId="evidence"/>);
    expect(teacher).toContain('href="/teacher/gradebook?section=english&amp;lesson=evidence&amp;kind=homework"');
    expect(teacher).toContain("Create quiz");
    expect(teacher).toContain("Create project");
    expect(teacher).toContain("Start discussion");
    expect(teacher).toContain('href="/teacher/discussions?section=english&amp;lesson=evidence"');
    expect(teacher).not.toContain('kind=discussion');
    expect(teacher).toContain('href="/teacher/gradebook?section=english&amp;assessment=hw1"');
    const guardian=renderToStaticMarkup(<ClassWorkspace data={{...data,role:"guardian"}} tab="lessons" lessonId="evidence"/>);
    expect(guardian).not.toContain("Create homework");
    expect(guardian).not.toContain('href="/student/assignments?section=english&amp;assessment=hw1"');
  });
  it("renders the 36-week provisional blueprint and typed lesson activities in the real Classes workspace",()=>{
    const blueprint=JSON.parse(readFileSync(new URL("../../curriculum/can-high-school-core/algebra1/yearlong-blueprint.json",import.meta.url),"utf8"));
    const unit=JSON.parse(readFileSync(new URL("../../curriculum/can-high-school-core/algebra1/unit01-week01.json",import.meta.url),"utf8"));
    const content=classContentSchema.parse({version:1,syllabus:"Unit 1 preview",blueprint,
      modules:[{id:unit.unitId,title:unit.title,lessons:unit.lessons}],resources:[]});
    const data={...workspace,content};
    const overview=renderToStaticMarkup(<ClassWorkspace data={data}/>);
    expect(overview).toContain("Yearlong course roadmap");
    expect(overview.replaceAll("<!-- -->","")).toContain("1 of 36 weeks authored");
    expect(overview).toContain("not certified as credit-ready");
    expect(overview).toContain("Planning only");
    const day=renderToStaticMarkup(<ClassWorkspace data={data} tab="lessons" lessonId="u01-d01"/>);
    expect(day).toContain("Learning targets");
    expect(day).toContain("Estimated lesson time: ");
    expect(day).toContain("Guided Practice");
    expect(day).toContain("Independent Practice");
    expect(day).toContain("Mark lesson complete");
    expect(day).toContain("ALGEBRA I • UNIT 1 • DAY 1 OF 5");
  });
  it("shows an authorized teacher a published-course planning view without treating lesson marks as credit",()=>{
    const student=renderToStaticMarkup(<ClassWorkspace data={workspace} tab="planning"/>);
    expect(student).toContain("Teacher planning is available only");
    expect(student).not.toContain("Teacher course implementation plan");
    const teacher=renderToStaticMarkup(<ClassWorkspace data={{...workspace,
      role:"teacher",lessonCompletionCounts:[{lessonId:"evidence",studentCount:1}],
      assessmentEvidence:[{
       id:"assessment-1",title:"Publisher lesson homework",curriculumLessonId:"evidence",
       unitId:null,attemptNumber:null,status:"not_submitted",score:null,pointsPossible:10,
      }],
    }} tab="planning"/>);
    expect(teacher).toContain("Teacher course implementation plan");
    expect(teacher).toContain("Publisher lesson homework");
    expect(teacher).toContain("1/1 learners self-reported complete");
    expect(teacher).toContain('href="/teacher/gradebook?section=english&amp;lesson=evidence&amp;kind=classwork"');
    expect(teacher).toContain("not mastery or credit");
    expect(teacher).not.toContain("Edit publisher");
  });
  it("shows validated answer keys only in the teacher-only classroom guide",()=>{
    const guide=JSON.parse(readFileSync(new URL("../../curriculum/can-high-school-core/algebra1/unit01-teacher-guide.json",import.meta.url),"utf8"));
    const teacherData={...workspace,role:"teacher" as const,teacherGuides:guide};
    const teacher=renderToStaticMarkup(<ClassWorkspace data={teacherData} tab="teacher-guide"/>);
    expect(teacher).toContain("Assessment answer guides");
    expect(teacher).toContain("Net revenue");
    expect(teacher).toContain("6=5");
    expect(teacher).toContain("not student-facing");
    const student=renderToStaticMarkup(<ClassWorkspace data={{...teacherData,role:"student"}} tab="teacher-guide"/>);
    const guardian=renderToStaticMarkup(<ClassWorkspace data={{...teacherData,role:"guardian"}} tab="teacher-guide"/>);
    for(const html of [student,guardian]){
      expect(html).not.toContain("Assessment answer guides");
      expect(html).not.toContain("Net revenue");
      expect(html).not.toContain("correctResponse");
      expect(html).toContain("Teacher-only materials are unavailable");
      expect(html).not.toContain("tab=teacher-guide");
    }
    const studentOverview=renderToStaticMarkup(<ClassWorkspace data={{...teacherData,role:"student"}}/>);
    expect(studentOverview).not.toContain("teacher-guide");
    const teacherOverview=renderToStaticMarkup(<ClassWorkspace data={teacherData}/>);
    expect(teacherOverview).toContain("Teacher guide");
  });
  it("retains the selected child in parent class and assignment links", () => {
    const html = renderToStaticMarkup(<ClassWorkspace data={{ ...workspace, role: "guardian", roster: [] }} tab="lessons"/>);
    expect(html).toContain('href="/classes?section=english&amp;student=child&amp;tab=lessons&amp;lesson=evidence"');
    expect(html).toContain('href="/guardian/academics?student=child&amp;section=english"');
    expect(html).not.toContain("/teacher/gradebook");
    expect(html).not.toContain("Roster");
  });
  it("restricts roster rendering and connects teacher reviews using profile IDs", () => {
    const teacher = renderToStaticMarkup(<ClassWorkspace data={{ ...workspace, role: "teacher" }} tab="people"/>);
    expect(teacher).toContain('href="/staff/students/child"');
    expect(teacher).toContain('href="/teacher/gradebook?section=english&amp;student=profile"');
    expect(teacher).toContain("0 / 1 lessons marked complete");
    const parent = renderToStaticMarkup(<ClassWorkspace data={{ ...workspace, role: "guardian" }} tab="people"/>);
    expect(parent).not.toContain("Jordan Student");
    expect(parent).toContain("available only to the assigned teaching team");
  });
  it("shows unavailable lessons explicitly and does not invent unpublished content", () => {
    expect(renderToStaticMarkup(<ClassWorkspace data={workspace} tab="lessons" lessonId="wrong"/>))
      .toContain("This lesson is unavailable");
    const html = renderToStaticMarkup(<ClassWorkspace data={{ ...workspace, content: null }} tab="lessons"/>);
    expect(html).toContain("No published learning content is configured");
    expect(html).not.toContain("Find evidence");
  });
  it("keeps private resource access behind a download command and escapes syllabus text", () => {
    const html = renderToStaticMarkup(<ClassWorkspace data={workspace} tab="files"/>);
    expect(html).toContain('href="https://www.loc.gov/"');
    expect(html).toContain("Private reading</button>");
    expect(html).not.toContain("10000000-0000");
    const syllabus = renderToStaticMarkup(<ClassWorkspace data={workspace} tab="syllabus"/>);
    expect(syllabus).toContain("&lt;script&gt;");
    expect(syllabus).not.toContain("<script>");
  });
  it("offers class/lesson supplemental resources only to the assigned teaching role",()=>{
    const teacher=renderToStaticMarkup(<ClassWorkspace data={{...workspace,role:"teacher"}} tab="files"/>);
    const student=renderToStaticMarkup(<ClassWorkspace data={workspace} tab="files"/>);
    const guardian=renderToStaticMarkup(<ClassWorkspace data={{...workspace,role:"guardian"}} tab="files"/>);
    expect(teacher).toContain("Add a teacher supplement");
    expect(teacher).toContain("Resource URL");
    expect(teacher).toContain('value="evidence"');
    for(const html of [student,guardian]){
      expect(html).not.toContain("Add a teacher supplement");
      expect(html).not.toContain("Resource URL");
    }
  });
  it("allows management only of a teacher's own supplement, never publisher or school material",()=>{
    const resources=[
     {id:"own",title:"My practice link",kind:"link",url:"https://example.org/own",
      lessonId:"evidence",source:"teacher" as const,canManage:true},
     {id:"school",title:"School packet",kind:"pdf",url:"https://example.org/school",
      lessonId:"evidence",source:"organization" as const,canManage:false},
     {id:"publisher",title:"Publisher reading",kind:"link",url:"https://example.org/publisher",
      lessonId:"evidence",source:"publisher" as const,canManage:false},
    ];
    const teacher=renderToStaticMarkup(<ClassWorkspace data={{...workspace,role:"teacher",supplements:resources}}
      tab="lessons" lessonId="evidence"/>);
    expect(teacher).toContain("Add resource to this lesson");
    expect(teacher).toContain("Manage My practice link");
    expect(teacher).toContain("Replace resource");
    expect(teacher).toContain("Retire resource");
    expect(teacher).not.toContain("Manage School packet");
    expect(teacher).not.toContain("Manage Publisher reading");
    const student=renderToStaticMarkup(<ClassWorkspace data={{...workspace,supplements:resources}}
      tab="lessons" lessonId="evidence"/>);
    expect(student).toContain("My practice link");
    expect(student).not.toContain("Replace resource");
    expect(student).not.toContain("Retire resource");
    expect(student).not.toContain("Add resource to this lesson");
  });
  it("lets only teachers publish announcements while all authorized readers see the feed", () => {
    for (const role of ["student", "guardian", "teacher"]) {
      const html = renderToStaticMarkup(<ClassWorkspace data={{ ...workspace, role }} tab="announcements"/>);
      expect(html).toContain("Bring your notes.");
      expect(html.includes("Publish announcement")).toBe(role === "teacher");
    }
  });
});

describe("lesson-linked teacher discussion",()=>{
 it("opens the existing discussion composer from a publisher lesson, not the gradebook",()=>{
  state.search={section:"english",lesson:"evidence"};
  const html=renderToStaticMarkup(<TeacherDiscussionsView data={{
   sections:[{id:"english",title:"English",curriculumLessons:[{id:"evidence",title:"Find evidence"}]}],
   threads:[],
  }}/>);
  expect(html).toContain("Publisher lesson: Find evidence");
  expect(html).toContain("Start a class discussion");
  expect(html).toContain("Post discussion");
  expect(html).not.toContain("Create an assessment");
 });
});
describe("production discussion controls", () => {
  const messages = [
    { id: "prompt", body: "Read the passage", authorLabel: "Participant", createdAt: "2026-10-01T12:00:00Z",
      parentMessageId: null, hidden: false, canModerate: false },
    { id: "reply", body: "An evidence example", authorLabel: "You", createdAt: "2026-10-01T12:00:00Z",
      parentMessageId: "prompt", hidden: false, canModerate: true },
  ];
  const thread = { id: "thread", subject: "Evidence", sectionId: "english", locked: false, messages };
  it("does not offer prompt moderation, but permits moderation of responses", () => {
    const html = renderToStaticMarkup(<TeacherDiscussionsView data={{ sections: [{ id: "english", title: "English" }], threads: [thread] }}/>);
    expect(html.match(/Hide post/g)).toHaveLength(1);
    expect(html).toContain("Teacher response");
    expect(html).not.toContain("synthetic");
  });
  function student(locked: boolean, hidden: boolean) {
    state.data = { ok: true, data: [{ ...thread, locked, messages: [{ ...messages[1], hidden }] }] };
    const Page = StudentDiscussions.options.component;
    if (typeof Page !== "function") throw new Error("Missing discussions component");
    return renderToStaticMarkup(<Page/>);
  }
  it("does not offer replies to hidden posts or locked threads", () => {
    expect(student(false, false)).toContain(">Reply</button>");
    expect(student(false, true)).not.toContain(">Reply</button>");
    expect(student(true, false)).not.toContain(">Reply</button>");
    expect(student(true, false)).not.toContain("Post response");
  });
});

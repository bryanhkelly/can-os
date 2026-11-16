import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  courseActivityPublicationSchema, nativeClassCompletionReadiness,
  publicNativeQuizQuestions, scoreNativeClassQuiz, validateNativeClassFeedback,
} from "@/domain/native-course-activities";

const questions=[
  {key:"q1",prompt:"Which option is correct?",choices:["wrong","correct"],correctIndex:1},
  {key:"q2",prompt:"Pick the second right answer",choices:["correct","wrong"],correctIndex:0},
];
const feedback=[
  {key:"f1",prompt:"Rate your confidence after class",kind:"rating" as const},
  {key:"f2",prompt:"What should we improve next time?",kind:"text" as const},
];
describe("published Course-level Class checks, feedback and completion evidence",()=>{
  it("scores only exact validated questions and does not publish answer keys",()=>{
    const score=scoreNativeClassQuiz(questions,[
      {key:"q1",choiceIndex:1},{key:"q2",choiceIndex:1},
    ]);
    expect(score).toEqual({earned:1,total:2,fraction:0.5});
    expect(publicNativeQuizQuestions(questions)[0]).toEqual({
      key:"q1",prompt:"Which option is correct?",choices:["wrong","correct"],
    });
    expect(JSON.stringify(publicNativeQuizQuestions(questions))).not.toContain("correctIndex");
    expect(()=>scoreNativeClassQuiz(questions,[
      {key:"q1",choiceIndex:1},{key:"q1",choiceIndex:1},
    ])).toThrow();
    expect(()=>scoreNativeClassQuiz(questions,[
      {key:"q1",choiceIndex:1},{key:"q2",choiceIndex:3},
    ])).toThrow();
  });
  it("validates one response per published feedback prompt and enforces response types",()=>{
    expect(validateNativeClassFeedback(feedback,[
      {key:"f1",rating:4,text:null},{key:"f2",rating:null,text:"More practice time"},
    ])).toHaveLength(2);
    expect(()=>validateNativeClassFeedback(feedback,[
      {key:"f1",rating:4,text:null},{key:"f1",rating:5,text:null},
    ])).toThrow();
    expect(()=>validateNativeClassFeedback(feedback,[
      {key:"f1",rating:null,text:"4"},{key:"f2",rating:null,text:"Thanks"},
    ])).toThrow();
  });
  it("rejects authoring duplicate keys and illegal scored answer indexes",()=>{
    const normal={
      courseVersionId:"00000000-0000-4000-8000-000000000001",
      title:"Digital skills pilot",quizQuestions:questions,feedbackQuestions:feedback,
      passingFraction:0.8,requireAllLessons:true,feedbackRequired:true,
      feedbackConsentVersion:"feedback-v1",
      feedbackConsentText:"Please share feedback to improve this training. Participation is identified.",
    };
    expect(courseActivityPublicationSchema.safeParse(normal).success).toBe(true);
    expect(courseActivityPublicationSchema.safeParse({
      ...normal,quizQuestions:[questions[0],questions[0]],
    }).success).toBe(false);
    expect(courseActivityPublicationSchema.safeParse({
      ...normal,quizQuestions:[{...questions[0],correctIndex:3}],
    }).success).toBe(false);
  });
  it("keeps readiness separate from a verified final evidence record or academic award",()=>{
    const pending=nativeClassCompletionReadiness({
      quizPassed:true,feedbackSubmitted:false,feedbackRequired:true,
      requireAllLessons:true,completedLessons:4,totalLessons:5,
    });
    expect(pending.eligible).toBe(false);
    const ready=nativeClassCompletionReadiness({
      quizPassed:true,feedbackSubmitted:true,feedbackRequired:true,
      requireAllLessons:true,completedLessons:5,totalLessons:5,
    });
    expect(ready.eligible).toBe(true);
    expect(nativeClassCompletionReadiness({
      quizPassed:true,feedbackSubmitted:true,feedbackRequired:false,
      requireAllLessons:true,completedLessons:0,totalLessons:0,
    }).eligible).toBe(false);
  });
  it("keeps answers private, policies pinned and explicit feedback consent, with no credential writes",()=>{
    const sql=readFileSync("database/canonical/v3.0.1/patch-unified-class-activities.sql","utf8");
    const service=readFileSync("src/modules/classes/native-course-activities.functions.ts","utf8");
    const player=readFileSync("src/components/learning/NativeCourseActivitiesPanel.tsx","utf8");
    expect(sql).toContain("education_v30_secure.course_activity_answer_keys");
    expect(sql).toContain("education_v30_secure.class_activity_submission_answers");
    expect(sql).toContain("class_activity_pin_source_trg");
    expect(sql).toContain("FORCE ROW LEVEL SECURITY");
    expect(sql).toContain("class_activity_submission_one_uq");
    expect(service).toContain("publisherOwnsCourse");
    expect(service).toContain("assertCurrentCanonicalStaffForMutation");
    expect(service).toContain("current pinned Course activity version");
    expect(service).toContain("data.feedbackConsentAccepted!==true");
    expect(service).toContain("createHash(\"sha256\")");
    expect(service).toContain("resultCode:\"noncredit_requirements_met\"");
    expect(service).not.toContain("canonicalClassAwards");
    expect(player).toContain("NativeCourseActivitiesPanel");
    expect(player).toContain("Verify completion evidence");
  });
});

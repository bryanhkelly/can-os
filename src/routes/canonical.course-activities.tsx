import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { WorkspaceShell } from "@/components/workspace";
import { normalizeClientError } from "@/lib/client-error";
import { getPublisherCourseActivityOptions } from "@/modules/classes/publisher-course-activity-options.functions";
import { createCanonicalSurveyDraft } from "@/modules/operations/canonical-survey-draft.functions";
import { createCanonicalObjectiveDraft, listCanonicalObjectiveDrafts } from
  "@/modules/classes/canonical-objective-draft.functions";
import type { CreateSurveyDraftInput } from "@/domain/canonical-survey-draft";

/**
 * The one-screen publisher experience from the original Class activities
 * prototype, restored WITHOUT its parallel answer, scoring or survey tables.
 * Quiz and survey drafts persist only through separately provisioned,
 * organization-bound canonical authoring commands. Neither write publishes
 * a Course assessment, survey campaign, result, credential or award.
 * Independent review and publication remain separate authority boundaries.
 */
export const Route=createFileRoute("/canonical/course-activities")({
  component:CourseActivityPublisher,
});

type Quiz={key:string;prompt:string;choices:string[];correctIndex:number};
type Feedback={key:string;prompt:string;kind:"rating"|"text";required:boolean};
const freshQuiz=():Quiz[]=>Array.from({length:5},(_,i)=>({
  key:"quiz_"+(i+1),prompt:"",choices:["","","",""],correctIndex:0,
}));
const freshFeedback=():Feedback[]=>Array.from({length:5},(_,i)=>({
  key:"feedback_"+(i+1),prompt:"",kind:i<3?"rating":"text",required:false,
}));
function validQuiz(questions:Quiz[]){
  return questions.length>0&&questions.length<=10&&questions.every(item=>
    item.prompt.trim().length>=5&&item.choices.length>=2&&
    item.choices.every(choice=>choice.trim().length>0)&&
    item.correctIndex>=0&&item.correctIndex<item.choices.length);
}
function CourseActivityPublisher(){
  const queryClient=useQueryClient();
  const courses=useQuery({
    queryKey:["publisher-course-activity-options"],
    queryFn:()=>getPublisherCourseActivityOptions(),
    retry:false,
  });
  const [courseVersionId,setCourseVersionId]=useState("");
  const [quiz,setQuiz]=useState<Quiz[]>(freshQuiz);
  const [feedback,setFeedback]=useState<Feedback[]>(freshFeedback);
  const [passing,setPassing]=useState(0.8);
  const [maxAttempts,setMaxAttempts]=useState(3);
  const [quizKey,setQuizKey]=useState("");
  const [quizTitle,setQuizTitle]=useState("Course knowledge check");
  const [quizBusy,setQuizBusy]=useState(false);
  const [quizDraft,setQuizDraft]=useState<{
    assessmentVersionId:string;formVersionId:string;questionCount:number;
  }|null>(null);
  const [surveyTitle,setSurveyTitle]=useState("Course feedback");
  const [surveyCode,setSurveyCode]=useState("");
  const [surveyBusy,setSurveyBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [surveyDraft,setSurveyDraft]=useState<{surveyId:string;surveyVersionId:string}|null>(null);
  const chosen=courses.data?.courses.find(row=>row.courseVersionId===courseVersionId);
  const priorDrafts=useQuery({
    queryKey:["publisher-canonical-quiz-drafts",courseVersionId],
    queryFn:()=>listCanonicalObjectiveDrafts({data:{courseVersionId}}),
    enabled:!!courseVersionId,retry:false,
  });

  function editQuiz(key:string,change:Partial<Quiz>){
    if(quizDraft||quizBusy)return;
    setQuiz(current=>current.map(row=>row.key===key?{...row,...change}:row));
  }
  function editFeedback(key:string,change:Partial<Feedback>){
    setFeedback(current=>current.map(row=>row.key===key?{...row,...change}:row));
  }
  async function saveQuiz(){
    if(quizBusy||quizDraft||!chosen)return;
    setError("");setNotice("");
    if(!validQuiz(quiz)){
      setError("Complete every quiz question and answer choice. Correct answers must be valid.");
      return;
    }
    setQuizBusy(true);
    try{
      const result=await createCanonicalObjectiveDraft({data:{
        courseVersionId:chosen.courseVersionId,
        assessmentKey:quizKey.trim().toLowerCase(),title:quizTitle.trim(),
        passingFraction:passing,maxAttempts,
        questions:quiz.map(q=>({prompt:q.prompt.trim(),
          choices:q.choices.map(v=>v.trim()),correctIndex:q.correctIndex})),
      }});
      setQuizDraft({assessmentVersionId:result.assessmentVersionId,
        formVersionId:result.formVersionId,questionCount:result.questionCount});
      void queryClient.invalidateQueries({
        queryKey:["publisher-canonical-quiz-drafts",chosen.courseVersionId],
      });
      setNotice("Canonical assessment draft saved with sealed answer keys. Independent review and publication are required before any Class can use it.");
    }catch(cause){
      setError(normalizeClientError(cause,
        "Assessment draft could not be saved. Verify the optional restricted publisher role, encryption key, and feature activation.").message);
    }finally{setQuizBusy(false);}
  }
  async function saveSurvey(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(surveyBusy||!chosen)return;
    setError("");setNotice("");setSurveyBusy(true);
    try{
      const value:CreateSurveyDraftInput={
        code:surveyCode.trim().toLowerCase(),
        title:surveyTitle.trim(),purposeCode:"training_feedback",
        intendedAudience:"learner",
        questions:feedback.map(row=>({
          prompt:row.prompt.trim(),type:row.kind,required:row.required,
          options:[],ratingMin:row.kind==="rating"?1:null,
          ratingMax:row.kind==="rating"?5:null,
        })),
      };
      // This command requires a separately provisioned survey-draft author
      // role and explicit feature activation. Never bypass publication review.
      const saved=await createCanonicalSurveyDraft({data:value});
      setSurveyDraft({surveyId:saved.surveyId,surveyVersionId:saved.surveyVersionId});
      setNotice("Five-question survey draft saved in the canonical survey engine. It is NOT published or linked to any Class. Independent review, publication, local campaign and consent are still required.");
    }catch(e){
      setError(normalizeClientError(e,
        "Cannot create the canonical survey draft. Confirm publisher survey-draft privileges and feature activation.").message);
    }finally{setSurveyBusy(false);}
  }
  return <WorkspaceShell width="wide" eyebrow="CAN OS · Publisher workspace"
    title="Course activities"
    subtitle="Prepare one reusable knowledge check and feedback experience for every authorized Class. Content is governed once, delivered locally."
    actions={<Link to="/canonical/classes" className="text-sm font-semibold underline underline-offset-4">
      Class management
    </Link>}>
    <section className="mt-5 border border-border bg-card p-5" aria-label="Publisher Course selection">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Step 1 · Choose the Course</p>
      <h2 className="mt-2 font-serif text-2xl">Published Course version</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Only published Course versions owned by your current publisher organization appear.
        A local Site administrator cannot change another publisher's Course content.
      </p>
      {courses.isPending&&<p role="status" className="mt-3 text-sm">Checking Course publisher rights…</p>}
      {courses.isError&&<p role="alert" className="mt-3 text-sm">
        Publisher Courses are unavailable to this signed-in role or environment.
      </p>}
      {courses.data&&<>
        <label className="mt-4 block text-sm font-semibold" htmlFor="course-activity-course">
          Course version
        </label>
        <select id="course-activity-course" value={courseVersionId}
          onChange={e=>{
            setCourseVersionId(e.target.value);
            setQuizDraft(null);setQuiz(freshQuiz());setQuizKey("");
            setQuizTitle("Course knowledge check");setSurveyDraft(null);
            setNotice("");setError("");
          }} className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm">
          <option value="">Select a publisher-owned Course</option>
          {courses.data.courses.map(row=><option key={row.courseVersionId}
            value={row.courseVersionId}>{row.title} · {row.courseCode}</option>)}
        </select>
        {courses.data.truncated&&<p className="mt-2 text-xs text-muted-foreground">
          More than 200 publisher Courses exist. Catalog pagination is required.
        </p>}
      </>}
      {chosen&&<div className="mt-4 border border-border bg-muted/20 p-4 text-sm">
        <p className="font-semibold">My organization's saved canonical drafts</p>
        {priorDrafts.isPending&&<p className="mt-2 text-muted-foreground">
          Checking draft inventory under your publisher role…
        </p>}
        {priorDrafts.isError&&<p className="mt-2 text-muted-foreground">
          Draft readback is not available until the separately scoped
          canonical assessment author role and release flag are enabled.
        </p>}
        {priorDrafts.data?.drafts.length===0&&<p className="mt-2 text-muted-foreground">
          No saved quiz drafts for this Course version.
        </p>}
        {!!priorDrafts.data?.drafts.length&&<ul className="mt-3 divide-y divide-border">
          {priorDrafts.data.drafts.map(row=><li key={row.assessmentVersionId}
            className="flex flex-wrap items-center justify-between gap-3 py-2">
            <div>
              <p className="font-semibold">{row.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {row.questionCount} questions · {Math.round(row.passingFraction*100)}% passing ·
                {row.maxAttempts} attempts
              </p>
            </div>
            <span className="text-xs font-semibold text-muted-foreground">
              Unpublished draft
            </span>
          </li>)}
        </ul>}
      </div>}
      {chosen&&<div className="mt-4 border border-border bg-muted/20 p-4 text-sm">
        <p className="font-semibold">Approved objective knowledge checks</p>
        {chosen.publishedKnowledgeChecks.length?
          <ul className="mt-2 space-y-1">
            {chosen.publishedKnowledgeChecks.map(item=><li key={item.versionId}>
              {item.title} · {item.purpose} · published
            </li>)}
          </ul>:
          <p className="mt-2 text-muted-foreground">
            No publisher-owned canonical knowledge check is published for this
            Course version. Draft questions below and submit for governed
            assessment authoring and publication.
          </p>}
      </div>}
    </section>
    <section className="mt-5 border border-border bg-card p-5" aria-label="Knowledge check authoring">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Step 2 · Prepare the quiz
      </p>
      <h2 className="mt-2 font-serif text-2xl">Knowledge check</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Five questions are the default, not hardcoded content. Correct answers are
        restricted publisher material. Save a real canonical draft using the
        organization-bound writer. Only a separate authorized reviewer can
        approve and publish it. No learner sees draft questions or answer keys.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          Assessment title
          <input value={quizTitle} minLength={5} maxLength={160} required
            disabled={quizBusy||!!quizDraft}
            onChange={e=>setQuizTitle(e.target.value)}
            className="mt-1 min-h-11 w-full border border-border bg-background px-3 text-sm"
            placeholder="AI skills knowledge check"/>
        </label>
        <label className="text-sm font-semibold">
          Unique assessment key
          <input value={quizKey} required pattern="[a-z][a-z0-9_-]{2,63}"
            maxLength={64} disabled={quizBusy||!!quizDraft}
            onChange={e=>setQuizKey(e.target.value.toLowerCase())}
            placeholder="ai_skills_check_01"
            className="mt-1 min-h-11 w-full border border-border bg-background px-3 text-sm"/>
        </label>
        <label className="text-sm font-semibold">
          Passing threshold
          <select value={passing} disabled={quizBusy||!!quizDraft}
            onChange={e=>setPassing(Number(e.target.value))}
            className="mt-1 min-h-11 w-full border border-border bg-background px-3 text-sm">
            {[0.6,0.7,0.8,0.9,1].map(v=><option key={v} value={v}>
              {Math.round(v*100)}%
            </option>)}
          </select>
        </label>
        <label className="text-sm font-semibold">
          Maximum attempts
          <select value={maxAttempts} disabled={quizBusy||!!quizDraft}
            onChange={e=>setMaxAttempts(Number(e.target.value))}
            className="mt-1 min-h-11 w-full border border-border bg-background px-3 text-sm">
            {[1,2,3,4,5].map(v=><option key={v} value={v}>{v} attempt{v>1?"s":""}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-4 space-y-4">
        {quiz.map((question,index)=><fieldset key={question.key} className="border border-border p-4">
          <legend className="px-1 font-semibold">Question {index+1}</legend>
          <label className="mt-2 block text-sm font-semibold" htmlFor={"quiz-prompt-"+question.key}>
            Question text
          </label>
          <input id={"quiz-prompt-"+question.key} value={question.prompt} maxLength={500}
            disabled={quizBusy||!!quizDraft}
            onChange={e=>editQuiz(question.key,{prompt:e.target.value})}
            className="mt-1 min-h-11 w-full border border-border bg-background px-3 text-sm"
            placeholder="Enter an original knowledge-check question"/>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {question.choices.map((choice,i)=><label key={i} className="text-sm">
              Answer {i+1}
              <input value={choice} maxLength={200}
                disabled={quizBusy||!!quizDraft}
                onChange={e=>editQuiz(question.key,{choices:question.choices.map(
                  (value,j)=>j===i?e.target.value:value,
                )})}
                className="mt-1 min-h-11 w-full border border-border bg-background px-3 text-sm"/>
            </label>)}
          </div>
          <label className="mt-3 block text-sm font-semibold" htmlFor={"quiz-answer-"+question.key}>
            Correct answer (publisher only)
          </label>
          <select id={"quiz-answer-"+question.key} value={question.correctIndex}
            disabled={quizBusy||!!quizDraft}
            onChange={e=>editQuiz(question.key,{correctIndex:Number(e.target.value)})}
            className="mt-1 min-h-11 w-full border border-border bg-background px-3 text-sm">
            {question.choices.map((choice,i)=><option value={i} key={i}>
              Answer {i+1}{choice?" · "+choice:""}
            </option>)}
          </select>
          <Button type="button" variant="outline" size="sm" className="mt-3"
            disabled={quizBusy||!!quizDraft||quiz.length<=1}
            onClick={()=>setQuiz(rows=>rows.filter(row=>row.key!==question.key))}>
            Remove question
          </Button>
        </fieldset>)}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button type="button" variant="outline"
          disabled={quizBusy||!!quizDraft||quiz.length>=10}
          onClick={()=>{setQuiz(rows=>[...rows,{
            key:"quiz_"+crypto.randomUUID().slice(0,8),prompt:"",
            choices:["","","",""],correctIndex:0,
          }])}}>  
          Add question
        </Button>
        <Button type="button"
          disabled={!chosen||quizBusy||!!quizDraft||!validQuiz(quiz)||
            !/^[a-z][a-z0-9_-]{2,63}$/.test(quizKey)||
            quizTitle.trim().length<5}
          onClick={()=>void saveQuiz()}>
          {quizBusy?"Saving encrypted canonical draft…":quizDraft?
            "Canonical draft saved":"Save canonical quiz draft"}
        </Button>
      </div>
      {quizDraft&&<div role="status"
        className="mt-4 space-y-2 border border-border bg-muted/20 p-4 text-sm">
        <p className="font-semibold">Canonical knowledge-check draft saved</p>
        <p className="break-all font-mono text-xs">
          Assessment {quizDraft.assessmentVersionId}
        </p>
        <p className="break-all font-mono text-xs">Form {quizDraft.formVersionId}</p>
        <p className="text-muted-foreground">
          {quizDraft.questionCount} sealed objective questions. This version
          is not published or accessible to learners. Independent assessment
          publication approval and local administration are still required.
        </p>
        <Link to="/canonical/lab/readiness" className="inline-block font-semibold underline">
          Canonical assessment inventory
        </Link>
      </div>}
    </section>
    <form className="mt-5 border border-border bg-card p-5" onSubmit={e=>void saveSurvey(e)}
      aria-label="Canonical feedback survey draft">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Step 3 · Draft participant feedback
      </p>
      <h2 className="mt-2 font-serif text-2xl">Course feedback</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Save these questions to the existing canonical survey-draft service
        under your authorized publisher role. Survey publication, campaign
        permission, Class attribution and individual invitations remain
        separate governed steps. Participation should be voluntary by default.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          Survey title
          <input value={surveyTitle} minLength={5} maxLength={160} required
            onChange={e=>setSurveyTitle(e.target.value)}
            className="mt-1 min-h-11 w-full border border-border bg-background px-3 text-sm"/>
        </label>
        <label className="text-sm font-semibold">
          Unique survey code
          <input value={surveyCode} required pattern="[a-z][a-z0-9_-]{2,63}"
            maxLength={64} placeholder="ai_skills_feedback_2027"
            onChange={e=>setSurveyCode(e.target.value.toLowerCase())}
            className="mt-1 min-h-11 w-full border border-border bg-background px-3 text-sm"/>
        </label>
      </div>
      <div className="mt-4 space-y-3">
        {feedback.map((question,index)=><div key={question.key}
          className="grid gap-3 border border-border p-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
          <label className="text-sm font-semibold">
            Question {index+1}
            <input value={question.prompt} minLength={5} maxLength={1000} required
              placeholder="What was most useful in this session?"
              onChange={e=>editFeedback(question.key,{prompt:e.target.value})}
              className="mt-1 min-h-11 w-full border border-border bg-background px-3 text-sm"/>
          </label>
          <label className="text-sm font-semibold">
            Response
            <select value={question.kind} onChange={e=>editFeedback(question.key,{
              kind:e.target.value as "rating"|"text",
            })} className="mt-1 min-h-11 w-full border border-border bg-background px-2 text-sm">
              <option value="rating">1–5 rating</option>
              <option value="text">Written</option>
            </select>
          </label>
          <div className="flex flex-col items-start justify-end gap-2">
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={question.required}
                onChange={e=>editFeedback(question.key,{required:e.target.checked})}/>
              Required
            </label>
            <Button type="button" variant="outline" size="sm"
              disabled={feedback.length<=1} onClick={()=>setFeedback(rows=>rows.filter(
                row=>row.key!==question.key))}>Remove</Button>
          </div>
        </div>)}
      </div>
      <Button type="button" variant="outline" className="mt-4" disabled={feedback.length>=20}
        onClick={()=>setFeedback(rows=>[...rows,{
          key:"feedback_"+crypto.randomUUID().slice(0,8),prompt:"",
          kind:"rating",required:false,
        }])}>Add feedback question</Button>
      <div className="mt-4 border-t border-border pt-4">
        <Button type="submit" disabled={surveyBusy||!chosen||!!surveyDraft}>
          {surveyBusy?"Saving canonical survey draft…":surveyDraft?
            "Survey draft saved":"Save canonical survey draft"}
        </Button>
      </div>
      {surveyDraft&&<div role="status" className="mt-3 space-y-2 border border-border bg-muted/20 p-3 text-sm">
        <p className="font-semibold">Canonical survey draft saved</p>
        <p className="break-all font-mono text-xs">{surveyDraft.surveyVersionId}</p>
        <div className="flex flex-wrap gap-4">
          <Link to="/canonical/lab/survey-reviews" className="underline">
            Independent review
          </Link>
          <Link to="/canonical/lab/survey-publications" className="underline">
            Approved publication
          </Link>
        </div>
      </div>}
    </form>
    <section className="mt-5 border border-border bg-card p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Step 4 · Release readiness
      </p>
      <h2 className="mt-2 font-serif text-2xl">Reuse across authorized Sites</h2>
      <ul className="mt-3 space-y-2 text-sm">
        <li>Course publication: {chosen?"Selected":"Select a published Course"}</li>
        <li>Canonical knowledge check: {chosen?.publishedKnowledgeChecks.length?
          "Publisher version already published":quizDraft?
            "Draft persisted; independent approval and publication pending":
            "Assessment draft and approval required"}</li>
        <li>Survey draft: {surveyDraft?"Saved; independent approval still required":
          "Not yet saved"}</li>
        <li>Local delivery: create an authorized Class and approved local survey campaign</li>
        <li>Person-specific access: provider assessment grants and survey invitations</li>
        <li>Completion: separate governed policy and decision; no automatic award</li>
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        National publishers retain Course content ownership. Each Site
        independently administers approved content under a current adoption.
        Saving a draft never publishes, sends invitations or creates learner evidence.
      </p>
    </section>
    {error&&<p role="alert" className="mt-4 border border-border p-3 text-sm text-destructive">{error}</p>}
    {notice&&<p role="status" className="mt-4 border border-border p-3 text-sm">{notice}</p>}
  </WorkspaceShell>;
}

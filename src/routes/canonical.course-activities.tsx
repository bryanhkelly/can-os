import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { normalizeClientError } from "@/lib/client-error";
import {
  getPublisherNativeCourseActivityOptions, publishNativeCourseActivitySet,
} from "@/modules/classes/native-course-activities.functions";
import type { QuizPrompt, FeedbackPrompt } from "@/domain/native-course-activities";

export const Route=createFileRoute("/canonical/course-activities")({
  component:CourseActivityPublisher,
});
function initialQuiz():QuizPrompt[]{
  return Array.from({length:5},(_,index)=>({
    key:"q"+(index+1),prompt:"",choices:["","","",""],correctIndex:0,
  }));
}
function initialFeedback():FeedbackPrompt[]{
  return Array.from({length:5},(_,index)=>({
    key:"f"+(index+1),prompt:"",kind:index<3?"rating":"text",
  }));
}
function CourseActivityPublisher(){
  const client=useQueryClient();
  const catalog=useQuery({
    queryKey:["native-course-activity-publisher-options"],
    queryFn:()=>getPublisherNativeCourseActivityOptions(),retry:false,
  });
  const [courseId,setCourseId]=useState("");
  const [title,setTitle]=useState("Course knowledge check and feedback");
  const [quiz,setQuiz]=useState<QuizPrompt[]>(initialQuiz);
  const [feedback,setFeedback]=useState<FeedbackPrompt[]>(initialFeedback);
  const [passing,setPassing]=useState(0.8);
  const [allLessons,setAllLessons]=useState(true);
  const [feedbackRequired,setFeedbackRequired]=useState(true);
  const [consentVersion,setConsentVersion]=useState("feedback-v1");
  const [consentText,setConsentText]=useState("");
  const [replace,setReplace]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const quizKey=useRef(6);
  const feedbackKey=useRef(6);
  const chosen=catalog.data?.courses.find(course=>course.courseVersionId===courseId);
  function editQuiz(key:string,change:Partial<QuizPrompt>){
    setQuiz(rows=>rows.map(item=>item.key===key?{...item,...change}:item));
  }
  function editFeedback(key:string,change:Partial<FeedbackPrompt>){
    setFeedback(rows=>rows.map(item=>item.key===key?{...item,...change}:item));
  }
  async function publish(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(busy||!courseId)return;
    setBusy(true);setError("");setNotice("");
    try{
      const saved=await publishNativeCourseActivitySet({data:{
        courseVersionId:courseId,title:title.trim(),
        quizQuestions:quiz,feedbackQuestions:feedback,passingFraction:passing,
        requireAllLessons:allLessons,feedbackRequired,
        feedbackConsentVersion:consentVersion.trim(),
        feedbackConsentText:consentText.trim(),
        replaceCurrentPublished:replace,
      }});
      await client.invalidateQueries({queryKey:["native-course-activity-publisher-options"]});
      setReplace(false);
      setNotice("Course activity version "+saved.versionNo+
        " published for this Course. Existing Class learners keep their pinned version. No academic grades or awards were created.");
    }catch(e){
      setError(normalizeClientError(e,"Publication failed. Check current publisher authority and question validity.").message);
    }finally{setBusy(false);}
  }
  return <WorkspaceShell width="wide" eyebrow="CAN OS · Reusable Course content"
    title="Knowledge checks and feedback"
    subtitle="Publish once per Course version; deliver through every authorized Class without reproducing the content for each Site."
    actions={<Link to="/canonical/classes" className="text-sm font-semibold underline">
      Class management
    </Link>}>
    <section className="mt-5 border border-border bg-card p-5">
      <h2 className="font-serif text-xl">Published publisher-owned Courses</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        A local hosting Site cannot edit a Course owned by another publisher.
        The publishing action rechecks the current verified publisher organization and staff session.
        Quiz keys are held separately from learner-facing questions. Identified feedback
        requires explicit participant consent.
      </p>
      {catalog.isPending&&<p role="status" className="mt-3 text-sm">Checking your publisher rights…</p>}
      {catalog.isError&&<p role="alert" className="mt-3 text-sm">
        Publisher access is not configured or this environment is not released.
      </p>}
      {catalog.isSuccess&&catalog.data.courses.length===0&&<p role="status" className="mt-3 text-sm">
        No published Course versions belong to this signed-in publisher organization.
      </p>}
      <label className="mt-4 block text-sm font-semibold" htmlFor="activity-course">Course version</label>
      <select id="activity-course" required value={courseId} onChange={e=>{
        setCourseId(e.target.value);setReplace(false);
      }} className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm">
        <option value="">Select a publisher-owned Course</option>
        {(catalog.data?.courses??[]).map(course=><option key={course.courseVersionId}
          value={course.courseVersionId}>{course.title}
          {course.publishedVersion?(" · Activities v"+course.publishedVersion):""}
        </option>)}
      </select>
      {chosen?.publishedVersion&&<p className="mt-3 text-sm">
        Current version: {chosen.publishedTitle} (v{chosen.publishedVersion}).
        Republishing creates a new immutable version; learners who have submitted
        against the previous version retain it.
      </p>}
    </section>
    <form onSubmit={e=>void publish(e)} className="mt-5 space-y-5">
      <section className="border border-border bg-card p-5">
        <h2 className="font-serif text-xl">Learning activity policy</h2>
        <label htmlFor="activity-title" className="mt-4 block text-sm font-semibold">Activity set name</label>
        <input id="activity-title" value={title} required minLength={3} maxLength={160}
          onChange={e=>setTitle(e.target.value)}
          className="mt-1 min-h-11 w-full border border-border bg-background px-3 text-sm"/>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold">Knowledge-check passing threshold
            <select value={passing} onChange={e=>setPassing(Number(e.target.value))}
              className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm">
              {[0.6,0.7,0.8,0.9,1].map(fraction=><option value={fraction} key={fraction}>
                {Math.round(fraction*100)}% correct
              </option>)}
            </select>
          </label>
          <fieldset className="space-y-3 text-sm">
            <legend className="font-semibold">Noncredit completion evidence</legend>
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" checked={allLessons} onChange={e=>setAllLessons(e.target.checked)}/>
              Require all published lesson milestones
            </label>
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" checked={feedbackRequired}
                onChange={e=>setFeedbackRequired(e.target.checked)}/>
              Require feedback submission
            </label>
          </fieldset>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          These low-stakes requirements never automatically issue academic credit, grades,
          participation awards, certificates or credentials.
        </p>
      </section>
      <section className="border border-border bg-card p-5">
        <h2 className="font-serif text-xl">Knowledge-check questions</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Five short questions are a convenient pilot default; 1–10 are supported.
          No questions or answer text are generated for you. Content belongs to the publisher.
        </p>
        <div className="mt-4 space-y-5">
          {quiz.map((question,index)=><div key={question.key} className="border border-border p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Question {index+1}</h3>
              <Button type="button" size="sm" variant="outline" disabled={quiz.length<=1}
                onClick={()=>setQuiz(rows=>rows.filter(row=>row.key!==question.key))}>
                Remove
              </Button>
            </div>
            <label className="mt-3 block text-sm font-semibold" htmlFor={"q-prompt-"+question.key}>
              Question
            </label>
            <input id={"q-prompt-"+question.key} value={question.prompt}
              required minLength={5} maxLength={500}
              onChange={e=>editQuiz(question.key,{prompt:e.target.value})}
              className="mt-1 min-h-11 w-full border border-border bg-background px-3 text-sm"/>
            <fieldset className="mt-3">
              <legend className="text-sm font-semibold">Answer choices</legend>
              {question.choices.map((choice,i)=><label key={i}
                className="mt-2 flex items-center gap-3 text-sm">
                <span className="min-w-6">{i+1}.</span>
                <input value={choice} required maxLength={200}
                  onChange={e=>editQuiz(question.key,{
                    choices:question.choices.map((item,j)=>j===i?e.target.value:item),
                  })}
                  className="min-h-11 flex-1 border border-border bg-background px-3"/>
              </label>)}
            </fieldset>
            <label className="mt-3 block text-sm font-semibold" htmlFor={"q-correct-"+question.key}>
              Correct answer (never shown to learners)
            </label>
            <select id={"q-correct-"+question.key} value={question.correctIndex}
              onChange={e=>editQuiz(question.key,{correctIndex:Number(e.target.value)})}
              className="mt-1 min-h-11 w-full border border-border bg-background px-3 text-sm">
              {question.choices.map((choice,i)=><option key={i} value={i}>
                {i+1}. {choice||"Unfilled choice"}
              </option>)}
            </select>
          </div>)}
        </div>
        <Button type="button" variant="outline" className="mt-4" disabled={quiz.length>=10}
          onClick={()=>setQuiz(rows=>[...rows,{
            key:"q"+quizKey.current++,prompt:"",choices:["","","",""],correctIndex:0,
          }])}>Add question</Button>
      </section>
      <section className="border border-border bg-card p-5">
        <h2 className="font-serif text-xl">Participant feedback</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Use simple ratings and short written responses. Do not request sensitive
          personal details in ordinary program feedback. Answers are kept in a
          restricted table, not in classroom displays or facilitator aggregates.
        </p>
        <div className="mt-4 space-y-4">
          {feedback.map((question,index)=><div key={question.key}
            className="grid gap-3 border border-border p-4 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
            <label className="text-sm font-semibold">
              Question {index+1}
              <input value={question.prompt} minLength={5} maxLength={500} required
                onChange={e=>editFeedback(question.key,{prompt:e.target.value})}
                className="mt-1 min-h-11 w-full border border-border bg-background px-3 text-sm"/>
            </label>
            <label className="text-sm font-semibold">
              Response
              <select value={question.kind}
                onChange={e=>editFeedback(question.key,{kind:e.target.value as "rating"|"text"})}
                className="mt-1 min-h-11 w-full border border-border bg-background px-2 text-sm">
                <option value="rating">1–5 rating</option>
                <option value="text">Short written</option>
              </select>
            </label>
            <Button type="button" size="sm" variant="outline" disabled={feedback.length<=1}
              onClick={()=>setFeedback(rows=>rows.filter(row=>row.key!==question.key))}>
              Remove
            </Button>
          </div>)}
        </div>
        <Button type="button" variant="outline" className="mt-4" disabled={feedback.length>=10}
          onClick={()=>setFeedback(rows=>[...rows,{
            key:"f"+feedbackKey.current++,prompt:"",kind:"rating",
          }])}>Add feedback question</Button>
        <div className="mt-4 border-t border-border pt-4">
          <label className="block text-sm font-semibold" htmlFor="feedback-consent-version">
            Feedback consent version
          </label>
          <input id="feedback-consent-version" value={consentVersion} required
            minLength={3} maxLength={60} onChange={e=>setConsentVersion(e.target.value)}
            className="mt-1 min-h-11 w-full border border-border bg-background px-3 text-sm"/>
          <label className="mt-3 block text-sm font-semibold" htmlFor="feedback-consent-text">
            Identified feedback terms and purpose
          </label>
          <textarea id="feedback-consent-text" value={consentText} required
            minLength={25} maxLength={2000} rows={4}
            onChange={e=>setConsentText(e.target.value)}
            className="mt-1 w-full border border-border bg-background p-3 text-sm"/>
        </div>
      </section>
      {chosen?.publishedVersion&&<label className="flex min-h-11 items-center gap-3 border border-border p-4 text-sm">
        <input type="checkbox" checked={replace} onChange={e=>setReplace(e.target.checked)}/>
        I confirm publishing a NEW version and closing the former published version.
        Existing learners with pinned submissions keep their previous policy.
      </label>}
      <Button type="submit" disabled={busy||!courseId||!!chosen?.publishedVersion&&!replace}>
        {busy?"Publishing…":"Publish reusable Course activities"}
      </Button>
      {error&&<p role="alert" className="border border-border p-4 text-sm text-destructive">{error}</p>}
      {notice&&<p role="status" className="border border-border p-4 text-sm">{notice}</p>}
    </form>
  </WorkspaceShell>;
}

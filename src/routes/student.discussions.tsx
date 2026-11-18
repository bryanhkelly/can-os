import { WorkspaceShell, EmptyState } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import {createFileRoute,Link,useRouter} from "@tanstack/react-router";
import {useState} from "react";
import {getCourseDiscussions} from "@/modules/learning/course-discussions.functions";
import {postDiscussionMessage} from "@/modules/learning/discussion-post.functions";
import {safeLoader} from "@/lib/safe-loader";
import {LoaderFailure} from "@/lib/loader-failure";
import { z } from "zod";
const loadCourseDiscussions=()=>getCourseDiscussions();
export const Route=createFileRoute("/student/discussions")({
 validateSearch:(search:Record<string,unknown>):{section?:string;lesson?:string;thread?:string}=>({
  section:typeof search.section==="string"?search.section:undefined,
  lesson:typeof search.lesson==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(search.lesson)?search.lesson:undefined,
  thread:typeof search.thread==="string"?z.string().uuid().parse(search.thread):undefined,
 }),
 loader:safeLoader(loadCourseDiscussions,{authMessage:"Sign in with an authorized student account to view course discussions."}),component:DiscussionsPage});
function DiscussionsPage(){
 const outcome=Route.useLoaderData();
 const {section,lesson,thread}=Route.useSearch();
 if(!outcome.ok)return <LoaderFailure eyebrow="Course discussions" title="Course discussions" outcome={outcome}/>;
 return <DiscussionsView threads={outcome.data.filter(item=>
    (!section||item.sectionId===section)&&(!thread||item.id===thread)&&
    (!lesson||item.curriculumLessonId===lesson||item.curriculumLessonId===null))}/>;
}
function DiscussionsView({threads}:{threads:Awaited<ReturnType<typeof loadCourseDiscussions>>}){
 const router=useRouter();
 const {section}=Route.useSearch();
 const [drafts,setDrafts]=useState<Record<string,string>>({});
 const [replyTo,setReplyTo]=useState<Record<string,string|null>>({});
 const mutation=useMutationFeedback(()=>router.invalidate());
 const busy=mutation.pending||mutation.refreshFailed;
 async function submit(threadId:string){
  await mutation.run(async()=>{
   await postDiscussionMessage({data:{threadId,body:drafts[threadId]??"",parentMessageId:replyTo[threadId]??null}});
   setDrafts(p=>({...p,[threadId]:""}));setReplyTo(p=>({...p,[threadId]:null}));
  },{successMessage:"Discussion response posted.",commandErrorMessage:"Unable to post discussion response."});
 }
 return <WorkspaceShell width="standard" eyebrow="Course discussions" title="Course discussions" subtitle="Course prompts and replies from your actively enrolled classes and teaching team." breadcrumbs={<Link to="/classes" search={{section}} className="text-sm underline">Back to {section?"class":"my classes"}</Link>}>
 <MutationFeedback state={mutation} className="mt-4" pendingMessage="Posting discussion response..."/>
 <div className="mt-6 space-y-5">{threads.map(thread=><section key={thread.id} className=" border bg-card p-5"><h2 className="font-serif text-2xl">{thread.subject}</h2><p className="mt-1 text-xs text-muted-foreground">{thread.messages.length} messages {thread.locked?"· Locked":""}</p><div className="mt-4 space-y-3">{thread.messages.map(message=><article key={message.id} className={" border p-3 text-sm "+(message.parentMessageId?"ml-5":"")}><p className="text-xs font-semibold">{message.authorLabel} · {new Date(message.createdAt).toLocaleDateString()}</p><p className="mt-2 whitespace-pre-wrap">{message.body}</p>{!thread.locked&&!message.hidden&&<Button type="button" variant="ghost" size="sm" disabled={busy} className="mt-2 underline" onClick={()=>setReplyTo(p=>({...p,[thread.id]:message.id}))}>Reply</Button>}</article>)}</div>
 {!thread.locked&&<div className="mt-5 border-t pt-4"><Field label={replyTo[thread.id]?"Reply to message":"New post"}><Textarea value={drafts[thread.id]??""} onChange={e=>setDrafts(p=>({...p,[thread.id]:e.target.value}))} maxLength={5000} rows={3} placeholder="Write a discussion response"/></Field>{replyTo[thread.id]&&<Button type="button" variant="ghost" size="sm" className="mr-3 underline" onClick={()=>setReplyTo(p=>({...p,[thread.id]:null}))}>Cancel reply</Button>}<Button disabled={busy||!(drafts[thread.id]??"").trim()} type="button" onClick={()=>void submit(thread.id)} className="mt-3">Post response</Button></div>}</section>)}{!threads.length&&<EmptyState title="No class discussions yet" description="No discussions have been posted for your classes yet."/>}</div></WorkspaceShell>;
}

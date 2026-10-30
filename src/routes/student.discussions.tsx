import {createFileRoute,Link,useRouter} from "@tanstack/react-router";
import {useState} from "react";
import {getCourseDiscussions} from "@/modules/learning/course-discussions.functions";
import {postDiscussionMessage} from "@/modules/learning/discussion-post.functions";
import {safeLoader} from "@/lib/safe-loader";
import {LoaderFailure} from "@/lib/loader-failure";
const loadCourseDiscussions=()=>getCourseDiscussions();
export const Route=createFileRoute("/student/discussions")({
 validateSearch:(search:Record<string,unknown>):{section?:string}=>({section:typeof search.section==="string"?search.section:undefined}),
 loader:safeLoader(loadCourseDiscussions,{authMessage:"Sign in with an authorized student account to view course discussions."}),component:DiscussionsPage});
function DiscussionsPage(){
 const outcome=Route.useLoaderData();
 const {section}=Route.useSearch();
 if(!outcome.ok)return <LoaderFailure eyebrow="CAN OS · Course discussions" title="Course discussions" outcome={outcome}/>;
 return <DiscussionsView threads={outcome.data.filter(thread=>!section||thread.sectionId===section)}/>;
}
function DiscussionsView({threads}:{threads:Awaited<ReturnType<typeof loadCourseDiscussions>>}){
 const router=useRouter();
 const {section}=Route.useSearch();
 const [drafts,setDrafts]=useState<Record<string,string>>({});
 const [replyTo,setReplyTo]=useState<Record<string,string|null>>({});
 const [error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false);
 async function submit(threadId:string){setBusy(true);setError(null);try{await postDiscussionMessage({data:{threadId,body:drafts[threadId]??"",parentMessageId:replyTo[threadId]??null}});setDrafts(p=>({...p,[threadId]:""}));setReplyTo(p=>({...p,[threadId]:null}));await router.invalidate();}catch(e){setError(e instanceof Error?e.message:"Unable to post discussion response.");}finally{setBusy(false);}}
 return <main className="mx-auto max-w-5xl px-5 py-10"><Link to="/classes" search={{section}} className="text-sm underline">Back to {section?"class":"my classes"}</Link><p className="mt-5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">CAN OS · Course discussions</p><h1 className="mt-2 font-serif text-4xl">Course discussions</h1><p className="mt-3 text-sm text-muted-foreground">Course prompts and replies from your actively enrolled classes and teaching team.</p>
 {error&&<p role="alert" className="mt-4 rounded-xl border p-3 text-sm">{error}</p>}
 <div className="mt-6 space-y-5">{threads.map(thread=><section key={thread.id} className="rounded-xl border bg-card p-5"><h2 className="font-serif text-2xl">{thread.subject}</h2><p className="mt-1 text-xs text-muted-foreground">{thread.messages.length} messages {thread.locked?"· Locked":""}</p><div className="mt-4 space-y-3">{thread.messages.map(message=><article key={message.id} className={"rounded-lg border p-3 text-sm "+(message.parentMessageId?"ml-5":"")}><p className="text-xs font-semibold">{message.authorLabel} · {new Date(message.createdAt).toLocaleDateString()}</p><p className="mt-2 whitespace-pre-wrap">{message.body}</p>{!thread.locked&&!message.hidden&&<button type="button" disabled={busy} className="mt-2 text-xs font-semibold underline disabled:opacity-50" onClick={()=>setReplyTo(p=>({...p,[thread.id]:message.id}))}>Reply</button>}</article>)}</div>
 {!thread.locked&&<div className="mt-5 border-t pt-4"><label className="block text-sm font-semibold">{replyTo[thread.id]?"Reply to message":"New post"}<textarea value={drafts[thread.id]??""} onChange={e=>setDrafts(p=>({...p,[thread.id]:e.target.value}))} maxLength={5000} rows={3} className="mt-2 w-full rounded-lg border bg-background p-3" placeholder="Write a discussion response"/></label>{replyTo[thread.id]&&<button type="button" className="mr-3 text-xs underline" onClick={()=>setReplyTo(p=>({...p,[thread.id]:null}))}>Cancel reply</button>}<button disabled={busy||!(drafts[thread.id]??"").trim()} type="button" onClick={()=>submit(thread.id)} className="mt-3 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">Post response</button></div>}</section>)}{!threads.length&&<p className="rounded-xl border p-5 text-sm text-muted-foreground">No discussions have been posted for your classes yet.</p>}</div></main>;
}

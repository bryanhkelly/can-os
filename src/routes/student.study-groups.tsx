import {useEffect,useState} from "react";
import {createFileRoute,useRouter} from "@tanstack/react-router";
import {getStudyGroupAvailability,listStudyGroups,requestStudyGroupMembership,leaveStudyGroup,getStudyGroupDetail,postStudyGroupMessage,reportStudyGroupPost,rsvpStudyGroupSession} from "@/modules/study-groups/study-groups.functions";
import {safeLoader} from "@/lib/safe-loader";
import {LoaderFailure} from "@/lib/loader-failure";
const loadStudyGroups=async()=>{
 const {enabled,writesEnabled,membershipEnabled}=await getStudyGroupAvailability();
 if(!enabled)return {enabled,writesEnabled,membershipEnabled,groups:[]};
 const groups=await listStudyGroups();
 // Student pages must not require facilitator-only permissions to render.
 return {enabled,writesEnabled,membershipEnabled,groups};
};
export const Route=createFileRoute("/student/study-groups")({validateSearch:(search:Record<string,unknown>):{group?:string;session?:string}=>({group:typeof search.group==="string"?search.group:undefined,session:typeof search.session==="string"?search.session:undefined}),loader:safeLoader(loadStudyGroups,{authMessage:"Sign in with an authorized student account to view study groups."}),component:StudyGroups});
function StudyGroups(){
 const outcome=Route.useLoaderData();
 if(!outcome.ok)return <LoaderFailure title="Study Groups" outcome={outcome}/>;
 return <StudyGroupsView data={outcome.data}/>;
}
function StudyGroupsView({data}:{data:Awaited<ReturnType<typeof loadStudyGroups>>}){
 const {enabled,writesEnabled,membershipEnabled,groups}=data;const router=useRouter();const search=Route.useSearch();
 const [selected,setSelected]=useState<string|null>(null),[detail,setDetail]=useState<Awaited<ReturnType<typeof getStudyGroupDetail>>|null>(null),[notice,setNotice]=useState("");
 const [message,setMessage]=useState("");
 useEffect(()=>{
  if(!enabled||!search.group||!groups.some(g=>g.id===search.group))return;
  let active=true;
  getStudyGroupDetail({data:{groupId:search.group}}).then(result=>{if(active){setSelected(search.group!);setDetail(result);}}).catch(()=>{if(active)setNotice("Unable to open the requested study group");});
  return ()=>{active=false};
 },[enabled,search.group,search.session,groups]);
 async function refresh(id?:string){if(id)setDetail(await getStudyGroupDetail({data:{groupId:id}}));await router.invalidate();}
 async function action(cb:()=>Promise<unknown>,id?:string){try{await cb();setNotice("Saved");await refresh(id);}catch(e){setNotice(e instanceof Error?e.message:"Action failed");}}
 if(!enabled)return <main className="mx-auto max-w-6xl space-y-6 px-6 py-10"><h1 className="font-serif text-4xl">Study Groups</h1><p role="status" className="rounded-lg border p-4">Study Groups are turned off for this deployment. Set CAN_DEMO_WRITES_ENABLED to a value other than false to restore this first-development workflow. No group or moderation records have been loaded.</p></main>;
 return <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
 <header><h1 className="font-serif text-4xl">Study Groups</h1><p className="mt-2 text-muted-foreground">Learn together across classes and interests. Membership is facilitator-approved.</p>{!writesEnabled&&<p role="status" className="mt-2 text-sm text-muted-foreground">Your eligible groups are available to view. You may request or leave a group with verified family consent. Posting and session RSVP are unavailable until the remaining moderation and session workflows are released.</p>}</header>
 {notice&&<p role="status" className="rounded-lg border p-3">{notice}</p>}
 <section className="grid gap-3 md:grid-cols-2">{groups.map(g=><article className="rounded-2xl border p-5" key={g.id}><p className="text-xs uppercase text-muted-foreground">{g.kind} group</p><h2 className="mt-2 text-xl font-semibold">{g.title}</h2><p className="mt-2 text-sm">{g.description}</p><p className="mt-2 text-xs">Membership: {g.membership??"not joined"} · Capacity {g.capacity}</p><div className="mt-4 flex flex-wrap gap-2"><button className="rounded-lg border px-3 py-2" onClick={async()=>{setSelected(g.id);try{setDetail(await getStudyGroupDetail({data:{groupId:g.id}}))}catch(e){setNotice(String(e))}}}>Open</button>{!g.membership||g.membership==="left"||g.membership==="declined"?<button disabled={!membershipEnabled} className="rounded-lg border px-3 py-2 disabled:opacity-40" onClick={()=>action(()=>requestStudyGroupMembership({data:{groupId:g.id}}),g.id)}>Request to join</button>:g.membership==="approved"||g.membership==="pending"?<button disabled={!membershipEnabled} className="rounded-lg border px-3 py-2 disabled:opacity-40" onClick={()=>action(()=>leaveStudyGroup({data:{groupId:g.id}}),g.id)}>{g.membership==="pending"?"Withdraw request":"Leave"}</button>:null}</div></article>)}</section>
 {selected&&detail&&<section className="space-y-4 rounded-2xl border p-6"><h2 className="text-2xl font-semibold">{detail.group.title}</h2><p>Membership: {detail.memberStatus??"not joined"}</p>{detail.memberStatus==="approved"&&<><h3 className="font-semibold">Sessions</h3>{detail.sessions.map(s=><div className={search.session===s.id?"rounded-lg border-2 border-primary p-3":"rounded-lg border p-3"} key={s.id}><p>{s.title} · {new Date(s.startsAt).toLocaleString()} · {s.agenda}{s.cancelled?" · Cancelled":""}</p><div className="mt-2 flex flex-wrap gap-2">{!s.cancelled&&(["going","maybe","declined"] as const).map(r=><button key={r} disabled={!writesEnabled} className="rounded-lg border px-2 py-1 text-xs disabled:opacity-40" onClick={()=>action(()=>rsvpStudyGroupSession({data:{sessionId:s.id,rsvp:r}}),selected)}>RSVP {r}</button>)}</div></div>)}<h3 className="font-semibold">Discussion</h3>{detail.posts.map(p=><div className="border-b py-2" key={p.id}><p>{p.body}</p><button disabled={!writesEnabled} className="text-xs underline disabled:opacity-40" onClick={()=>{const reason=window.prompt("Why should this post be reviewed?");if(reason)void action(()=>reportStudyGroupPost({data:{groupId:selected,postId:p.id,reason}}),selected)}}>Report</button></div>)}<textarea disabled={!writesEnabled} className="w-full rounded-lg border p-3 disabled:opacity-40" value={message} onChange={e=>setMessage(e.target.value)} placeholder="Ask a question or share study tips"/><button disabled={!writesEnabled||!message.trim()} className="rounded-lg border px-3 py-2 disabled:opacity-40" onClick={()=>action(async()=>{await postStudyGroupMessage({data:{groupId:selected,body:message}});setMessage("")},selected)}>Post message</button></>}</section>}
 </main>;
}

import {useEffect,useState} from "react";
import {createFileRoute,Link,useRouter} from "@tanstack/react-router";
import {listStudyGroups,getStudyGroupDetail} from "@/modules/study-groups/study-group-queries.functions";
import {getStudyGroupAvailability} from "@/modules/study-groups/canonical-workspace.functions";
import {createCanonicalGroupPost as postStudyGroupMessage,reportCanonicalGroupPost as reportStudyGroupPost} from "@/modules/study-groups/canonical-moderation.functions";
import {rsvpCanonicalGroupSession as rsvpStudyGroupSession} from "@/modules/study-groups/canonical-sessions.functions";
import {requestCanonicalGroupMembership,leaveCanonicalGroup} from "@/modules/study-groups/canonical-membership.functions";
import {safeLoader} from "@/lib/safe-loader";
import {LoaderFailure} from "@/lib/loader-failure";
const loadStudyGroups=async()=>{
 const {enabled,writesEnabled,membershipEnabled,contentEnabled}=await getStudyGroupAvailability();
 if(!enabled)return {enabled,writesEnabled,membershipEnabled,contentEnabled,groups:[]};
 const groups=await listStudyGroups();
 // Student pages must not require facilitator-only permissions to render.
 return {enabled,writesEnabled,membershipEnabled,contentEnabled,groups};
};
export const Route=createFileRoute("/student/study-groups")({validateSearch:(search:Record<string,unknown>):{group?:string;session?:string}=>({group:typeof search.group==="string"?search.group:undefined,session:typeof search.session==="string"?search.session:undefined}),loader:safeLoader(loadStudyGroups,{authMessage:"Sign in with an authorized student account to view study groups."}),component:StudyGroups});
function StudyGroups(){
 const outcome=Route.useLoaderData();
 if(!outcome.ok)return <LoaderFailure title="Study Groups" outcome={outcome}/>;
 return <StudyGroupsView data={outcome.data}/>;
}
function StudyGroupsView({data}:{data:Awaited<ReturnType<typeof loadStudyGroups>>}){
 const {enabled,writesEnabled,membershipEnabled,contentEnabled,groups}=data;const router=useRouter();const search=Route.useSearch();
 const [selected,setSelected]=useState<string|null>(null),[detail,setDetail]=useState<Awaited<ReturnType<typeof getStudyGroupDetail>>|null>(null),[notice,setNotice]=useState("");
 const [message,setMessage]=useState("");
 const [opening,setOpening]=useState(false),[openError,setOpenError]=useState("");
 useEffect(()=>{
  setSelected(null);setDetail(null);setMessage("");setNotice("");setOpenError("");setOpening(false);
  if(!enabled||!search.group)return;
  if(!groups.some(g=>g.id===search.group)){setOpenError("This study group is unavailable in your current workspace.");return;}
  let active=true;
  setOpening(true);
  getStudyGroupDetail({data:{groupId:search.group}}).then(result=>{if(active){setSelected(search.group!);setDetail(result);}}).catch(cause=>{if(active)setOpenError(cause instanceof Error?cause.message:"Unable to open the requested study group");}).finally(()=>{if(active)setOpening(false);});
  return ()=>{active=false};
 },[enabled,search.group,search.session,groups]);
 async function refresh(id?:string){if(id)setDetail(await getStudyGroupDetail({data:{groupId:id}}));await router.invalidate();}
 async function action(cb:()=>Promise<unknown>,id?:string){try{setNotice("Saving...");await cb();await refresh(id);setNotice("Saved");}catch(e){setNotice(e instanceof Error?e.message:"Action failed");}}
 if(!enabled)return <main className="mx-auto max-w-6xl space-y-6 px-6 py-10"><h1 className="font-serif text-4xl">Study Groups</h1><p role="status" className="rounded-lg border p-4">Study Groups are turned off for this deployment. Set CAN_DEMO_WRITES_ENABLED to a value other than false to restore this first-development workflow. No group or moderation records have been loaded.</p></main>;
 return <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
 <header><h1 className="font-serif text-4xl">Study Groups</h1><p className="mt-2 text-muted-foreground">Learn together across classes and interests. Membership is facilitator-approved.</p>{!writesEnabled&&<p role="status" className="mt-2 text-sm text-muted-foreground">You may join approved groups, participate in their moderated discussions, and report concerning content. Session RSVPs remain unavailable until the session workflow is released.</p>}</header>
 {notice&&<p role="status" className="rounded-lg border p-3">{notice}</p>}
 {search.group&&<Link to="/student/study-groups" search={{}} className="inline-block text-sm underline">All study groups</Link>}
 {opening&&<p role="status">Opening study group...</p>}
 {openError&&<p role="alert" className="rounded-lg border p-3">{openError}</p>}
 <section className="grid gap-3 md:grid-cols-2">{groups.filter(group=>!search.group||group.id===search.group).map(g=><article className="rounded-2xl border p-5" key={g.id}><p className="text-xs uppercase text-muted-foreground">{g.kind} group</p><h2 className="mt-2 text-xl font-semibold"><Link to="/student/study-groups" search={{group:g.id}} className="hover:underline">{g.title}</Link></h2><p className="mt-2 text-sm">{g.description}</p><p className="mt-2 text-xs">Membership: {g.membership??"not joined"} · Capacity {g.capacity}</p><div className="mt-4 flex flex-wrap gap-2">{!search.group&&<Link to="/student/study-groups" search={{group:g.id}} className="rounded-lg border px-3 py-2">Open</Link>}{!g.membership||g.membership==="left"||g.membership==="declined"?<button disabled={!membershipEnabled} className="rounded-lg border px-3 py-2 disabled:opacity-40" onClick={()=>action(()=>requestCanonicalGroupMembership({data:{groupId:g.id}}),g.id)}>Request to join</button>:g.membership==="approved"||g.membership==="pending"?<button disabled={!membershipEnabled} className="rounded-lg border px-3 py-2 disabled:opacity-40" onClick={()=>action(()=>leaveCanonicalGroup({data:{groupId:g.id}}),g.id)}>{g.membership==="pending"?"Withdraw request":"Leave"}</button>:null}</div></article>)}</section>
 {!groups.length&&<p role="status" className="rounded-lg border p-4">No study groups are available for your current enrollment. Groups require active program enrollment and, for course groups, matching class enrollment. Contact your school if an expected group is missing.</p>}
 {search.session&&detail?.memberStatus==="approved"&&!detail.sessions.some(session=>session.id===search.session)&&<p role="alert">This session is unavailable in the selected study group.</p>}
 {detail&&detail.memberStatus!=="approved"&&<p role="status" className="rounded-lg border p-4">{detail.memberStatus==="pending"?"Your request is awaiting facilitator approval.":"Request membership to access group discussions and sessions."}</p>}
 {selected&&detail&&<section className="space-y-4 rounded-2xl border p-6"><h2 className="text-2xl font-semibold">{detail.group.title}</h2><p>Membership: {detail.memberStatus??"not joined"}</p>{detail.memberStatus==="approved"&&<><h3 className="font-semibold">Sessions</h3>{detail.sessions.map(s=><div className={search.session===s.id?"rounded-lg border-2 border-primary p-3":"rounded-lg border p-3"} key={s.id}><p>{s.title} · {new Date(s.startsAt).toLocaleString()} · {s.agenda}{s.cancelled?" · Cancelled":""}</p><div className="mt-2 flex flex-wrap gap-2">{!s.cancelled&&(["going","maybe","declined"] as const).map(r=><button key={r} disabled={!writesEnabled} className="rounded-lg border px-2 py-1 text-xs disabled:opacity-40" onClick={()=>action(()=>rsvpStudyGroupSession({data:{sessionId:s.id,rsvp:r}}),selected)}>RSVP {r}</button>)}</div></div>)}<h3 className="font-semibold">Discussion</h3><p className="text-xs text-muted-foreground">Posts are visible to approved group members. Report unsafe or inappropriate content for facilitator review. For urgent safety concerns, contact a trusted adult or school staff directly.</p>{detail.posts.map(p=><div className="border-b py-2" key={p.id}><p>{p.body}</p><button disabled={!contentEnabled} className="text-xs underline disabled:opacity-40" onClick={()=>{const reason=window.prompt("Why should this post be reviewed?");if(reason)void action(()=>reportStudyGroupPost({data:{groupId:selected,postId:p.id,reason}}),selected)}}>Report</button></div>)}<textarea disabled={!contentEnabled} className="w-full rounded-lg border p-3 disabled:opacity-40" value={message} onChange={e=>setMessage(e.target.value)} placeholder="Ask a question or share study tips"/><button disabled={!contentEnabled||!message.trim()} className="rounded-lg border px-3 py-2 disabled:opacity-40" onClick={()=>action(async()=>{await postStudyGroupMessage({data:{groupId:selected,body:message}});setMessage("")},selected)}>Post message</button></>}</section>}
 </main>;
}

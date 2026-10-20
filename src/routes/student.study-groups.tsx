import {useEffect,useState} from "react";
import {createFileRoute,Link,useRouter} from "@tanstack/react-router";
import {listStudyGroups,listStudentStudyGroupSections,listStudentStudyGroupClassmates,getStudyGroupDetail} from "@/modules/study-groups/study-group-queries.functions";
import {getStudyGroupAvailability} from "@/modules/study-groups/canonical-workspace.functions";
import {createCanonicalGroupPost as postStudyGroupMessage,reportCanonicalGroupPost as reportStudyGroupPost} from "@/modules/study-groups/canonical-moderation.functions";
import {rsvpCanonicalGroupSession as rsvpStudyGroupSession} from "@/modules/study-groups/canonical-sessions.functions";
import {createStudentStudyGroup,requestCanonicalGroupMembership,leaveCanonicalGroup} from "@/modules/study-groups/canonical-membership.functions";
import {safeLoader} from "@/lib/safe-loader";
import {LoaderFailure} from "@/lib/loader-failure";
const loadStudyGroups=async()=>{
 const {enabled,writesEnabled,membershipEnabled,creationEnabled,contentEnabled}=await getStudyGroupAvailability();
 if(!enabled)return {enabled,writesEnabled,membershipEnabled,creationEnabled,contentEnabled,groups:[],sections:[]};
 const [groups,sections]=await Promise.all([listStudyGroups(),listStudentStudyGroupSections()]);
 // Student pages must not require facilitator-only permissions to render.
 return {enabled,writesEnabled,membershipEnabled,creationEnabled,contentEnabled,groups,sections};
};
export const Route=createFileRoute("/student/study-groups")({validateSearch:(search:Record<string,unknown>):{group?:string;session?:string}=>({group:typeof search.group==="string"?search.group:undefined,session:typeof search.session==="string"?search.session:undefined}),loader:safeLoader(loadStudyGroups,{authMessage:"Sign in with an authorized student account to view study groups."}),component:StudyGroups});
function StudyGroups(){
 const outcome=Route.useLoaderData();
 if(!outcome.ok)return <LoaderFailure title="Study Groups" outcome={outcome}/>;
 return <StudyGroupsView data={outcome.data}/>;
}
function StudyGroupsView({data}:{data:Awaited<ReturnType<typeof loadStudyGroups>>}){
 const {enabled,writesEnabled,membershipEnabled,creationEnabled,contentEnabled,groups,sections}=data;const router=useRouter();const search=Route.useSearch();
 const [selected,setSelected]=useState<string|null>(null),[detail,setDetail]=useState<Awaited<ReturnType<typeof getStudyGroupDetail>>|null>(null),[notice,setNotice]=useState("");
 const [message,setMessage]=useState("");
 const [opening,setOpening]=useState(false),[openError,setOpenError]=useState("");
 const [sectionId,setSectionId]=useState(sections[0]?.id??"");
 const [classmates,setClassmates]=useState<Awaited<ReturnType<typeof listStudentStudyGroupClassmates>>>([]);
 const [inviteeIds,setInviteeIds]=useState<string[]>([]);
 const [groupTitle,setGroupTitle]=useState(""),[groupDescription,setGroupDescription]=useState("");
 const [rosterLoading,setRosterLoading]=useState(false),[rosterError,setRosterError]=useState("");
 const [creating,setCreating]=useState(false),[createError,setCreateError]=useState("");
 useEffect(()=>{
  let active=true;
  setClassmates([]);setInviteeIds([]);setRosterError("");
  if(!sectionId)return;
  setRosterLoading(true);
  listStudentStudyGroupClassmates({data:{sectionId}})
   .then(result=>{if(active)setClassmates(result);})
   .catch(error=>{if(active)setRosterError(error instanceof Error?error.message:"Unable to load classmates.");})
   .finally(()=>{if(active)setRosterLoading(false);});
  return()=>{active=false;};
 },[sectionId]);
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
 {sections.length===0&&<p role="status" className="rounded-lg border p-4">No active enrolled classes are currently available for creating a study group.</p>}
 {sections.length>0&&(!creationEnabled||!writesEnabled)&&<p role="status" className="rounded-lg border p-4">Creating study groups is unavailable right now.</p>}
 {sections.length>0&&creationEnabled&&writesEnabled&&<section className="space-y-4 rounded-2xl border p-5" aria-labelledby="create-study-group-title">
  <div><h2 id="create-study-group-title" className="text-xl font-semibold">Create a study group</h2>
   <p className="mt-1 text-sm text-muted-foreground">Start a group for one of your classes and invite classmates. Your class teacher will facilitate the group, and membership approvals still apply.</p></div>
  <form className="grid gap-4" onSubmit={event=>{
   event.preventDefault();setCreateError("");
   if(creating)return;
   setCreating(true);
   void createStudentStudyGroup({data:{
    sectionId,title:groupTitle,description:groupDescription,inviteePersonIds:inviteeIds,
    maxMembers:Math.max(20,inviteeIds.length+1),
   }}).then(async()=>{
    setGroupTitle("");setGroupDescription("");setInviteeIds([]);
    setNotice("Group created and invitations sent. Your membership is awaiting guardian permission and facilitator approval.");
    await router.invalidate();
   }).catch(error=>setCreateError(error instanceof Error?error.message:"Unable to create the study group."))
    .finally(()=>setCreating(false));
  }}>
   <label className="text-sm">Class
    <select className="mt-1 block w-full rounded border bg-background p-2" value={sectionId}
     onChange={event=>setSectionId(event.target.value)} required>
     {sections.map(section=><option key={section.id} value={section.id}>{section.title}</option>)}
    </select>
   </label>
   <label className="text-sm">Group name
    <input className="mt-1 block w-full rounded border bg-background p-2" value={groupTitle}
     onChange={event=>setGroupTitle(event.target.value)} minLength={3} maxLength={100} required/>
   </label>
   <label className="text-sm">What will you study together?
    <textarea className="mt-1 block w-full rounded border bg-background p-2" value={groupDescription}
     onChange={event=>setGroupDescription(event.target.value)} minLength={10} maxLength={2000} required/>
   </label>
   <fieldset className="space-y-2">
    <legend className="text-sm font-medium">Invite classmates</legend>
    {rosterLoading&&<p role="status" className="text-sm text-muted-foreground">Loading classmates...</p>}
    {rosterError&&<p role="alert" className="text-sm text-destructive">{rosterError}</p>}
    {!rosterLoading&&!rosterError&&classmates.length===0&&<p className="text-sm text-muted-foreground">There are no other currently enrolled classmates in this class.</p>}
    {classmates.map(classmate=><label className="flex items-center gap-2 text-sm" key={classmate.id}>
     <input type="checkbox" checked={inviteeIds.includes(classmate.id)} onChange={event=>setInviteeIds(ids=>
      event.target.checked?[...ids,classmate.id]:ids.filter(id=>id!==classmate.id))}/>
     {classmate.firstName} {classmate.lastName}
    </label>)}
   </fieldset>
   {createError&&<p role="alert" className="text-sm text-destructive">{createError}</p>}
   <button disabled={creating||rosterLoading||!sectionId||inviteeIds.length===0}
    className="w-fit rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">
    {creating?"Creating group...":"Create group and send invitations"}
   </button>
  </form>
 </section>}
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

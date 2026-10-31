import {useState} from "react";
import {createFileRoute,useRouter,Link} from "@tanstack/react-router";
import {listCanonicalGuardianGroupConsents} from "@/modules/study-groups/canonical-workspace.functions";
import {decideCanonicalGroupConsent} from "@/modules/study-groups/canonical-membership.functions";
import {safeLoader} from "@/lib/safe-loader";
import {LoaderFailure} from "@/lib/loader-failure";
import {WorkspaceShell} from "@/components/workspace";
export const Route=createFileRoute("/guardian/group-permissions")({
 validateSearch:(search:Record<string,unknown>):{action?:string}=>({
  action:typeof search.action==="string"?search.action:undefined,
 }),
 loader:safeLoader(()=>listCanonicalGuardianGroupConsents(),{
  authMessage:"Sign in as the student's authorized guardian to review group participation."}),
 component:GuardianConsents
});
function GuardianConsents(){
 const data=Route.useLoaderData();
 if(!data.ok)return <LoaderFailure eyebrow="CAN OS · Family" title="Study group consent" outcome={data}/>;
 return <ConsentList items={data.data}/>;
}
function ConsentList({items}:{items:Awaited<ReturnType<typeof listCanonicalGuardianGroupConsents>>}){
 const router=useRouter();
 const {action}=Route.useSearch();
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [acknowledged,setAcknowledged]=useState<Record<string,boolean>>({});
 async function decide(actionId:string,approve:boolean){
  setBusy(true);setError("");setNotice("");
  try{const result=await decideCanonicalGroupConsent({data:{actionId,approve,acknowledged:approve && acknowledged[actionId]===true}});
   setNotice("obsolete" in result&&result.obsolete?"Request cleared — it was no longer active.":approve?"Permission granted; facilitator review still applies.":"Permission declined.");
   try{await router.invalidate();}
   catch{setError("Your decision was saved, but the permission list could not refresh. Reopen it rather than submitting twice.");}
  }
  catch(e){setError(e instanceof Error?e.message:"Unable to save permission");}
  finally{setBusy(false);}
 }
 return <WorkspaceShell eyebrow="CAN OS · Family" title="Study group permissions"
  subtitle="Decide whether your student may participate in a teacher-facilitated group. The facilitator must also approve membership."
  actions={<div className="flex flex-wrap gap-2">
   <Link to="/guardian/course-approvals" className="rounded-lg border px-3 py-2 text-sm">Course approvals</Link>
   <Link to="/guardian/field-trips" className="rounded-lg border px-3 py-2 text-sm">Field trips</Link>
   <Link to="/guardian" className="rounded-lg border px-3 py-2 text-sm">Family home</Link>
  </div>}>
  {notice&&<p className="mt-5 rounded-lg border p-3 text-sm" role="status">{notice}</p>}
  {error&&<p className="mt-5 rounded-lg border border-red-500 p-3 text-sm" role="alert">{error}</p>}
  {action&&<Link to="/guardian/group-permissions" className="mt-4 inline-block text-sm underline">View all group permissions</Link>}
  {action&&!items.some(item=>item.id===action)&&<p role="alert" className="mt-4 rounded-xl border p-4">This permission request is unavailable in your current family workspace.</p>}
  <div className="mt-7 space-y-3">{items.filter(item=>!action||item.id===action).map(item=><article key={item.id} className="rounded-xl border bg-card p-5">
   <h2 className="font-semibold">{item.groupTitle}</h2>
   <p className="mt-2 text-sm text-muted-foreground">{item.obsolete?"This request is no longer active — the student's membership request was withdrawn or already decided.":item.status==="open"?"Your decision is needed":item.decision==="approve"?"Permission approved":"Permission declined"}</p>
   {item.obsolete&&<div className="mt-4 flex gap-2">
    <button disabled={busy} onClick={()=>decide(item.id,false)} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">Dismiss</button>
   </div>}
   {!item.obsolete&&item.status==="open"&&<label className="mt-4 flex items-start gap-3 text-sm">
    <input type="checkbox" checked={acknowledged[item.id]??false}
      onChange={event=>setAcknowledged(previous=>({...previous,[item.id]:event.target.checked}))}
      className="mt-1"/>
    <span>I understand this request permits my student to participate in a supervised school study group, subject to facilitator approval.</span>
   </label>}
   {!item.obsolete&&item.status==="open"&&<div className="mt-4 flex gap-2">
    <button disabled={busy||!acknowledged[item.id]} onClick={()=>decide(item.id,true)} className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">Allow participation</button>
    <button disabled={busy} onClick={()=>decide(item.id,false)} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">Decline</button>
   </div>}
  </article>)}
  {!items.length&&<p className="rounded-xl border p-5 text-sm text-muted-foreground">No group permission requests are waiting for your decision.</p>}
  </div>
 </WorkspaceShell>;
}

import {useState} from "react";
import {createFileRoute,useRouter,Link} from "@tanstack/react-router";
import {listGuardianStudyGroupConsents,decideGuardianStudyGroupConsent} from "@/modules/study-groups/study-groups.functions";
import {safeLoader} from "@/lib/safe-loader";
import {LoaderFailure} from "@/lib/loader-failure";
import {WorkspaceShell} from "@/components/workspace";
export const Route=createFileRoute("/guardian/study-group-consent")({
 loader:safeLoader(()=>listGuardianStudyGroupConsents(),{
  authMessage:"Sign in as the student's authorized guardian to review group participation."}),
 component:GuardianConsents
});
function GuardianConsents(){
 const data=Route.useLoaderData();
 if(!data.ok)return <LoaderFailure eyebrow="CAN OS · Family" title="Study group consent" outcome={data}/>;
 return <ConsentList items={data.data}/>;
}
function ConsentList({items}:{items:Awaited<ReturnType<typeof listGuardianStudyGroupConsents>>}){
 const router=useRouter();
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 async function decide(actionId:string,approve:boolean){
  setBusy(true);setError("");setNotice("");
  try{await decideGuardianStudyGroupConsent({data:{actionId,approve}});
   await router.invalidate();setNotice(approve?"Permission granted.":"Permission declined.");}
  catch(e){setError(e instanceof Error?e.message:"Unable to save permission");}
  finally{setBusy(false);}
 }
 return <WorkspaceShell eyebrow="CAN OS · Family" title="Study group permissions"
  subtitle="Decide whether your student may participate in a teacher-facilitated group. The facilitator must also approve membership."
  actions={<Link to="/guardian" className="rounded-lg border px-3 py-2 text-sm">Family Home</Link>}>
  {notice&&<p className="mt-5 rounded-lg border p-3 text-sm" role="status">{notice}</p>}
  {error&&<p className="mt-5 rounded-lg border border-red-500 p-3 text-sm" role="alert">{error}</p>}
  <div className="mt-7 space-y-3">{items.map(item=><article key={item.id} className="rounded-xl border bg-card p-5">
   <h2 className="font-semibold">{item.groupTitle}</h2>
   <p className="mt-1 text-sm">Student: <strong>{item.studentName}</strong></p>
   <p className="mt-2 text-sm text-muted-foreground">{item.status==="open"?"Your decision is needed":item.decision==="approve"?"Permission approved":"Permission declined"}</p>
   {item.status==="open"&&<div className="mt-4 flex gap-2">
    <button disabled={busy} onClick={()=>decide(item.id,true)} className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">Allow participation</button>
    <button disabled={busy} onClick={()=>decide(item.id,false)} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">Decline</button>
   </div>}
  </article>)}
  {!items.length&&<p className="rounded-xl border p-5 text-sm text-muted-foreground">No group permission requests are waiting for your decision.</p>}
  </div>
 </WorkspaceShell>;
}

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getSchoolBlueprintReviewDesk, decideSchoolBlueprintReview } from "@/modules/programs/school-blueprint-review.functions";
import { getSchoolPlanningProspectusReviewDesk, reviewSchoolPlanningProspectus } from "@/modules/sites/school-planning-prospectus.functions";

type Request=Awaited<ReturnType<typeof getSchoolBlueprintReviewDesk>>[number];
type Proposal={programs?:Array<{id:string;name:string}>;items?:Array<{id:string;title:string}>};
type Choice="approved"|"changes_required"|"future"|"declined";
type Subject={kind:"program"|"item";id:string;title:string};
function proposalSubjects(req:Request):Subject[]{
 const snapshot=req.proposalSnapshot as Proposal;
 return [...(snapshot.programs??[]).map(p=>({kind:"program" as const,id:p.id,title:p.name})),
  ...(snapshot.items??[]).map(i=>({kind:"item" as const,id:i.id,title:i.title}))];
}
export function CANSchoolBlueprintReviewDesk(){
 const [requests,setRequests]=useState<Request[]>([]);
 const [prospectuses,setProspectuses]=useState<Awaited<ReturnType<typeof getSchoolPlanningProspectusReviewDesk>>>([]);
 const [choices,setChoices]=useState<Record<string,Choice>>({});
 const [conditions,setConditions]=useState<Record<string,string>>({});
 const [scope,setScope]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const load=useCallback(async()=>{
  const [reviews,publications]=await Promise.all([getSchoolBlueprintReviewDesk(),getSchoolPlanningProspectusReviewDesk()]);
  setRequests(reviews);setProspectuses(publications);
 },[]);
 useEffect(()=>{void load().catch(()=>setError("Unable to load CAN Blueprint reviews."));},[load]);
 const key=(id:string,kind:string,subjectId:string)=>id+":"+kind+":"+subjectId;
 async function decide(req:Request){
  const subjects=proposalSubjects(req);
  if(!subjects.length||subjects.some(s=>!choices[key(req.id,s.kind,s.id)])){
   setError("Select an explicit review outcome for every proposed offering.");return;
  }
  const statement=scope[req.id]??"";
  if(statement.trim().length<20){setError("Describe the approved school scope before recording decisions.");return;}
  setBusy(true);setError("");setNotice("");
  try{
   const decisions=subjects.map(subject=>{
    const k=key(req.id,subject.kind,subject.id),choice=choices[k]!;
    const publicVisibility=choice==="approved"?"confirmed":choice==="changes_required"?"under_review":choice==="future"?"future":"hidden";
    return {subjectKind:subject.kind,subjectId:subject.id,decision:choice,publicVisibility,
     publicSummary:null,requiredForOpening:false,
     conditions:conditions[k]?{reviewerNotes:conditions[k]}:{},evidence:{},effectiveFrom:null,effectiveThrough:null};
   });
   await decideSchoolBlueprintReview({data:{siteId:req.siteId,reviewRequestId:req.id,
     expectedApprovedVersion:req.expectedApprovedVersion,schoolScopeStatement:statement,decisions}});
   await load();
   setNotice("CAN review saved as an immutable approved-scope baseline. Independent opening authorization is unchanged.");
  }catch(e){setError(e instanceof Error?e.message:"Blueprint review was not recorded.");}
  finally{setBusy(false);}
 }
 async function reviewPublic(id:string){
  setBusy(true);setError("");setNotice("");
  try{await reviewSchoolPlanningProspectus({data:{releaseId:id}});await load();
   setNotice("Public prospectus approved for publication. Site publisher must still publish it.");
  }catch(e){setError(e instanceof Error?e.message:"Public copy review failed.");}
  finally{setBusy(false);}
 }
 return <section className="mt-6 rounded-xl border bg-card p-5 space-y-5" aria-label="CAN School Blueprint reviews">
  <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Independent institutional review</p>
   <h2 className="mt-2 font-serif text-2xl">School Blueprint decisions</h2>
   <p className="mt-2 text-sm text-muted-foreground">
    Approve specific operating scope and review public promises separately. CAN approval does not constitute state authorization.
   </p></div>
  {error&&<p role="alert" className="border p-3 text-sm text-destructive">{error}</p>}
  {notice&&<p role="status" className="border p-3 text-sm">{notice}</p>}
  {requests.length===0?<p className="text-sm text-muted-foreground">No pending School Blueprint submissions.</p>:requests.map(req=>{
   const subjects=proposalSubjects(req);
   return <article key={req.id} className="space-y-3 border p-4">
    <div><h3 className="text-lg font-semibold">{req.siteName}</h3>
     <p className="text-xs text-muted-foreground">Proposed revision {req.sourceRevision} · Next approved baseline {req.expectedApprovedVersion+1}</p></div>
    <label className="block text-sm font-medium">School scope decision statement
     <textarea className="mt-2 min-h-20 w-full border bg-background p-2 text-sm" maxLength={1500}
      value={scope[req.id]??""} onChange={e=>setScope(current=>({...current,[req.id]:e.target.value}))}
      placeholder="Specify approved grades and scope, excluding any withheld offerings."/>
    </label>
    <div className="grid gap-3 lg:grid-cols-2">{subjects.map(subject=>{
     const k=key(req.id,subject.kind,subject.id);
     return <div key={k} className="border p-3">
      <h4 className="font-semibold">{subject.title}</h4>
      <p className="text-xs text-muted-foreground">{subject.kind}</p>
      <label className="mt-3 block text-sm">Review outcome
       <select className="mt-1 w-full border bg-background p-2" value={choices[k]??""}
        onChange={e=>setChoices(current=>({...current,[k]:e.target.value as Choice}))}>
        <option value="">Select decision…</option>
        <option value="approved">CAN-approved scope</option>
        <option value="changes_required">Changes required</option>
        <option value="future">Future phase</option>
        <option value="declined">Not approved</option>
       </select>
      </label>
      <label className="mt-3 block text-sm">Internal requirements or remediation (not public)
       <textarea className="mt-1 w-full border bg-background p-2" maxLength={2500}
        value={conditions[k]??""} onChange={e=>setConditions(current=>({...current,[k]:e.target.value}))}/>
      </label>
     </div>;
    })}</div>
    <Button variant="outline" disabled={busy||subjects.some(s=>!choices[key(req.id,s.kind,s.id)])||(scope[req.id]?.trim().length??0)<20}
      onClick={()=>void decide(req)}>Record reviewed Blueprint scope</Button>
   </article>;
  })}
  <div className="border-t pt-5">
   <h3 className="font-serif text-xl">Public planning prospectus reviews</h3>
   <p className="mt-1 text-sm text-muted-foreground">Only reviewed wording may be published. Internal remediation notes never appear here.</p>
   {prospectuses.length===0?<p className="mt-3 text-sm text-muted-foreground">No prospectuses awaiting public-content review.</p>:
    <div className="mt-4 space-y-4">{prospectuses.map(release=><article key={release.id} className="border p-4">
     <h4 className="font-semibold">{release.siteName} · prospectus {release.revision}</h4>
     <p className="mt-2 font-medium">{release.prospectus.heading}</p>
     <p className="mt-1 text-sm">{release.prospectus.introduction}</p>
     <ul className="mt-2 list-inside list-disc text-sm">{release.prospectus.items.map(x=>
      <li key={x.sourceKind+":"+x.sourceId}>{x.title} · {x.state}</li>)}</ul>
     <Button variant="outline" className="mt-3" disabled={busy} onClick={()=>void reviewPublic(release.id)}>
      Approve parent-facing prospectus
     </Button>
    </article>)}</div>}
  </div>
 </section>;
}

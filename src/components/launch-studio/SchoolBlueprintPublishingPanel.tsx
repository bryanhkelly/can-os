import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { submitSchoolBlueprintForReview } from "@/modules/programs/school-blueprint-review.functions";
import { prepareSchoolPlanningProspectus, publishSchoolPlanningProspectus } from "@/modules/sites/school-planning-prospectus.functions";
import type { getSiteBlueprintWorkspace } from "@/modules/programs/school-blueprint.functions";

type Workspace=Awaited<ReturnType<typeof getSiteBlueprintWorkspace>>;
type Subject={kind:"program"|"item";id:string;title:string};
export function SchoolBlueprintPublishingPanel({siteId,workspace,onRefresh}:{
 siteId:string;workspace:Workspace;onRefresh:()=>Promise<void>;
}){
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [heading,setHeading]=useState("Our school is taking shape");
 const [introduction,setIntroduction]=useState("Explore the programs and experiences we hope to offer as we prepare our new school. Families can register interest while these plans are reviewed.");
 const [selected,setSelected]=useState<string[]>([]);
 const [reason,setReason]=useState("CAN-reviewed planning prospectus for prospective families");
 const [preview,setPreview]=useState<Awaited<ReturnType<typeof prepareSchoolPlanningProspectus>>["prospectus"]|null>(null);
 const subjects:Subject[]=[
  ...workspace.programs.map(x=>({kind:"program" as const,id:x.id,title:x.name})),
  ...workspace.items.map(x=>({kind:"item" as const,id:x.id,title:x.title})),
 ];
 const currentKeys=subjects.map(x=>x.kind+":"+x.id);
 useEffect(()=>{setSelected(old=>old.length?old.filter(id=>currentKeys.includes(id)):currentKeys);},
 // eslint-disable-next-line react-hooks/exhaustive-deps
 [workspace.revision,siteId]);
 async function run(task:()=>Promise<void>){
  setBusy(true);setError("");setMessage("");
  try{await task();await onRefresh();}
  catch(e){setError(e instanceof Error?e.message:"Unable to save this School Blueprint change.");}
  finally{setBusy(false);}
 }
 const choose=(key:string,checked:boolean)=>
  setSelected(list=>checked?[...list.filter(x=>x!==key),key]:list.filter(x=>x!==key));
 return <section className="border bg-card p-6 space-y-5" aria-label="School Blueprint approval and prospectus">
  <div>
   <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">From vision to commitments</p>
   <h3 className="mt-2 font-serif text-2xl">Blueprint approval & family prospectus</h3>
   <p className="mt-2 text-sm leading-6 text-muted-foreground">
    Your proposal remains editable. CAN holds the approved scope separately.
    Families may see a CAN-reviewed planning prospectus without being promised an unapproved activity.
   </p>
  </div>
  <div className="grid gap-3 sm:grid-cols-3">
   <div className="border p-4"><p className="text-xs text-muted-foreground">Proposed Blueprint</p>
    <p className="font-semibold">Draft v{workspace.revision}</p></div>
   <div className="border p-4"><p className="text-xs text-muted-foreground">CAN-approved scope</p>
    <p className="font-semibold">{workspace.latestApproval?"Version "+workspace.latestApproval.version:"Not yet reviewed"}</p>
    <p className="mt-1 text-xs text-muted-foreground">Not state licensure or permission to open</p></div>
   <div className="border p-4"><p className="text-xs text-muted-foreground">Planning prospectus</p>
    <p className="font-semibold">{workspace.latestProspectus?.mode==="planning_prospectus"
      ?workspace.latestProspectus.status:"Not prepared"}</p></div>
  </div>
  {error&&<p role="alert" className="border p-3 text-sm text-destructive">{error}</p>}
  {message&&<p role="status" className="border p-3 text-sm">{message}</p>}
  <div className="flex flex-wrap items-center gap-3">
   <Button disabled={busy||workspace.revision<1||subjects.length===0}
    onClick={()=>void run(async()=>{
     const r=await submitSchoolBlueprintForReview({data:{siteId,expectedRevision:workspace.revision}});
     setMessage(r.created?"Submitted the frozen Blueprint for CAN review.":"This revision is already submitted.");
    })}>Submit Blueprint for CAN review</Button>
   <p className="text-xs text-muted-foreground">{workspace.latestReview
    ?("Review request: revision "+workspace.latestReview.sourceRevision+" · "+workspace.latestReview.status)
    :"No review requested"}</p>
  </div>
  <div className="border-t pt-5">
   <h4 className="font-semibold">Design the parent-facing planning prospectus</h4>
   <p className="mt-1 text-sm text-muted-foreground">Choose what families can explore. CAN reviews all public wording before publication.</p>
   <label className="mt-4 block text-sm font-semibold" htmlFor="prospectus-heading">Public headline</label>
   <input id="prospectus-heading" className="mt-2 w-full border bg-background px-3 py-2 text-sm"
    maxLength={120} value={heading} onChange={e=>setHeading(e.target.value)}/>
   <label className="mt-4 block text-sm font-semibold" htmlFor="prospectus-introduction">Introduction</label>
   <textarea id="prospectus-introduction" className="mt-2 min-h-28 w-full border bg-background px-3 py-2 text-sm"
    maxLength={1000} value={introduction} onChange={e=>setIntroduction(e.target.value)}/>
   <fieldset className="mt-4 border p-4"><legend className="px-2 text-sm font-semibold">Include proposed offerings</legend>
    <div className="grid gap-2 sm:grid-cols-2">{subjects.map(x=>{
      const key=x.kind+":"+x.id;
      return <label key={key} className="flex items-start gap-2 text-sm">
       <input type="checkbox" checked={selected.includes(key)} onChange={e=>choose(key,e.target.checked)}/>
       <span>{x.title} <span className="text-xs text-muted-foreground">({x.kind})</span></span>
      </label>;
     })}</div>
   </fieldset>
   <Button className="mt-4" disabled={busy||selected.length===0||workspace.revision<1}
    onClick={()=>void run(async()=>{
     const includedSubjects=subjects.filter(x=>selected.includes(x.kind+":"+x.id)).map(x=>({kind:x.kind,id:x.id}));
     const r=await prepareSchoolPlanningProspectus({data:{siteId,expectedBlueprintRevision:workspace.revision,
      heading,introduction,includedSubjects}});
     setPreview(r.prospectus);setMessage("Private prospectus candidate saved. CAN public-content review is required.");
    })}>Prepare prospectus candidate</Button>
  </div>
  {preview&&<div className="border bg-muted p-4">
   <h4 className="font-semibold">Private prospectus preview</h4>
   <p className="mt-2 text-sm">{preview.introduction}</p>
   <ul className="mt-3 space-y-2">{preview.items.map(x=><li key={x.sourceKind+":"+x.sourceId} className="text-sm">
      <strong>{x.title}</strong> · {x.state==="confirmed"?"CAN-approved scope":x.state==="under_review"?"Under review":"Future plan"}
   </li>)}</ul>
   <p className="mt-3 text-xs">Approval is not the same as enrollment availability.</p>
  </div>}
  {workspace.latestProspectus?.mode==="planning_prospectus"&&<div className="border-t pt-5">
    <h4 className="font-semibold">Publish the reviewed prospectus</h4>
    <p className="mt-1 text-sm text-muted-foreground">Current status: {workspace.latestProspectus.status}. A reserved public address and CAN content review are required.</p>
    <label htmlFor="prospectus-publish-reason" className="mt-3 block text-sm font-medium">Publication reason</label>
    <input id="prospectus-publish-reason" className="mt-2 w-full border bg-background px-3 py-2 text-sm"
      value={reason} maxLength={500} onChange={e=>setReason(e.target.value)}/>
    <Button className="mt-3" disabled={busy||workspace.latestProspectus.status!=="approved"||!workspace.sitePublication}
      onClick={()=>void run(async()=>{
       if(!workspace.sitePublication||!workspace.latestProspectus)return;
       await publishSchoolPlanningProspectus({data:{
        siteId,releaseId:workspace.latestProspectus.id,
        expectedSiteRevision:new Date(workspace.sitePublication.updatedAt).toISOString(),reason,
       }});
       setMessage("Planning prospectus published. Enrollment remains separately authorized.");
      })}>Publish planning prospectus</Button>
   </div>}
 </section>;
}

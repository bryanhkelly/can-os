import { useWorkspaceMutation } from "@/hooks/useWorkspaceMutation";
import { SchoolYearCard } from "@/components/operations/SchoolYearCard";
import { useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import {
 getSchoolYearStudio, createStudioGradeScale, createStudioYear,
} from "@/modules/academic-time/school-year-studio.functions";
import { suggestedSchoolYear } from "@/domain/school-year-defaults";
import { WorkspaceShell } from "@/components/workspace";

type Snapshot=Awaited<ReturnType<typeof getSchoolYearStudio>>;
export function SchoolYearStudioWorkspace({data,selection}:{data:Snapshot;selection:{siteId?:string;programId?:string}}){
 const router=useRouter();
 const [siteId,setSiteId]=useState(selection.siteId??data.programs.find(p=>p.id===selection.programId)?.siteId??data.sites[0]?.id??"");
 const [programId,setProgramId]=useState(selection.programId??"");
 const [scaleId,setScaleId]=useState(()=>{
  const selectedSite=data.sites.find(site=>site.id===siteId);
  const scales=data.gradeScales.filter(scale=>scale.organizationId===selectedSite?.organizationId);
  return scales.length===1?scales[0]!.id:"";
 });
 const [newScaleName,setNewScaleName]=useState("Standard A–F");
 // Prefer the selected Program's persisted target; no URL date or browser
 // checklist becomes canonical planning state. Every field stays editable.
 const [suggestedYear]=useState(()=>suggestedSchoolYear(new Date(),
  data.programs.find(program=>program.id===selection.programId)?.targetOpeningDate));
 const [name,setName]=useState(suggestedYear.name);
 const [key,setKey]=useState(suggestedYear.key);
 const [start,setStart]=useState(suggestedYear.startsOn),[end,setEnd]=useState(suggestedYear.endsOn);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const mutation=useWorkspaceMutation({mutationFn:(operation:()=>Promise<unknown>)=>operation(),invalidateRouter:()=>router.invalidate()});
 const busy=mutation.isSubmitting;
 async function run(operation:()=>Promise<unknown>){
  if(busy)return;
  setError("");setNotice("");
  try{const submission=await mutation.submit(operation);
   if(submission.status === "ignored")return;
   if(submission.refreshError){setError("Saved successfully, but refresh failed. Reopen this workspace; do not resubmit.");return;}
   setNotice("Saved to school records.");}
  catch(e){setError(e instanceof Error?e.message:"Unable to save");}
 }
 const scopedPrograms=data.programs.filter(p=>p.siteId===siteId);
 const site=data.sites.find(s=>s.id===siteId);
 const siteScales=data.gradeScales.filter(scale=>scale.organizationId===site?.organizationId);
 const targetOpeningDate=scopedPrograms.find(program=>program.id===programId)?.targetOpeningDate;
 const selectedScaleId=siteScales.some(scale=>scale.id===scaleId)?scaleId:
  siteScales.length===1?siteScales[0]!.id:"";
 return <WorkspaceShell eyebrow="CAN OS · Academic operations" title="School-year studio"
  subtitle="Configure site-owned school years, terms, grading periods and academic calendars. Activation requires readiness checks."
  actions={<Link to="/operations" search={{siteId:undefined,programId:undefined}} className="rounded-lg border px-3 py-2 text-sm">Operations</Link>}>
  {error&&<p role="alert" className="mt-5 rounded-lg border border-red-500 p-3 text-sm">{error}</p>}
  {notice&&<p role="status" className="mt-5 rounded-lg border p-3 text-sm">{notice}</p>}
  <section className="mt-8 rounded-xl border bg-card p-5">
   <h2 className="font-serif text-2xl">Create a school year</h2>
   <div className="mt-4 grid gap-3 sm:grid-cols-2">
    <label className="text-sm">Site<select value={siteId} onChange={e=>{setSiteId(e.target.value);setProgramId("");setScaleId("");}} className="mt-1 w-full rounded border p-2 bg-background">{data.sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <label className="text-sm">Program (optional)<select value={programId} onChange={e=>setProgramId(e.target.value)} className="mt-1 w-full rounded border p-2 bg-background"><option value="">Site-wide</option>{scopedPrograms.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
    <label className="text-sm">Year name<input value={name} onChange={e=>setName(e.target.value)} className="mt-1 w-full rounded border p-2 bg-background"/></label>
    <label className="text-sm">Year key<input value={key} onChange={e=>setKey(e.target.value)} className="mt-1 w-full rounded border p-2 bg-background"/></label>
    <label className="text-sm">Starts<input type="date" value={start} onChange={e=>setStart(e.target.value)} className="mt-1 w-full rounded border p-2 bg-background"/></label>
    <label className="text-sm">Ends<input type="date" value={end} onChange={e=>setEnd(e.target.value)} className="mt-1 w-full rounded border p-2 bg-background"/></label>
    <label className="text-sm sm:col-span-2">Grading scale<select value={selectedScaleId} onChange={e=>setScaleId(e.target.value)} className="mt-1 w-full rounded border p-2 bg-background"><option value="">Choose scale</option>{siteScales.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
   </div>
   {targetOpeningDate&&<div className="mt-3 rounded border p-3 text-sm">
    <p>Target opening: {targetOpeningDate}. Suggested dates are planning defaults; review terms,
     instructional days and local calendar requirements before activation.</p>
    <button type="button" disabled={busy} onClick={()=>{
      const suggested=suggestedSchoolYear(new Date(),targetOpeningDate);
      setName(suggested.name);setKey(suggested.key);setStart(suggested.startsOn);setEnd(suggested.endsOn);
    }} className="mt-2 rounded border px-3 py-2 text-sm disabled:opacity-50">Use saved target opening date</button>
   </div>}
   {!siteScales.length&&<p role="status" className="mt-3 text-sm">
    This school needs a grading scale. Create the standard scale below, then continue with its school year.
   </p>}
   <div className="mt-3 flex flex-wrap items-end gap-2">
    <label className="text-xs">New grading scale name
      <input value={newScaleName} onChange={e=>setNewScaleName(e.target.value)}
        className="mt-1 block rounded border bg-background p-2 text-sm"/>
    </label>
    <button type="button" disabled={busy||!site?.organizationId||!newScaleName.trim()}
      onClick={()=>run(async()=>{
        const result=await createStudioGradeScale({data:{
          organizationId:site!.organizationId,name:newScaleName}});
        setScaleId(result.gradeScaleId);
      })}
      className="rounded border px-3 py-2 text-sm disabled:opacity-50">Create standard A–F scale</button>
   </div>
   <button disabled={busy||!siteId||!selectedScaleId} onClick={()=>run(()=>createStudioYear({data:{siteId,...(programId?{programId}:{}),gradeScaleId:selectedScaleId,key,name,startsOn:start,endsOn:end}}))} className="mt-4 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">Create school year</button>
  </section>
  <h2 className="mt-10 font-serif text-2xl">School years</h2>
  <div className="mt-4 space-y-4">{data.years.filter(y=>!siteId||y.siteId===siteId).map(y=><SchoolYearCard key={y.id} year={y} busy={busy} run={run}/>)}
  {!data.years.length&&<p className="rounded-xl border p-5 text-sm">No school years have been configured at your sites.</p>}</div>
 </WorkspaceShell>;
}

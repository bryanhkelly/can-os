import {useState} from "react";
import {createFileRoute,Link,useRouter} from "@tanstack/react-router";
import {listCoursePolicies,updateCoursePolicy} from "@/modules/learning/registration-policy.functions";
import {safeLoader} from "@/lib/safe-loader";
import {LoaderFailure} from "@/lib/loader-failure";
import {WorkspaceShell} from "@/components/workspace";
export const Route=createFileRoute("/operations/course-policies")({
 loader:safeLoader(()=>listCoursePolicies(),{authMessage:"Sign in as the authorized registrar."}),
 component:CoursePoliciesPage,
});
function CoursePoliciesPage(){
 const result=Route.useLoaderData();
 if(!result.ok)return <LoaderFailure eyebrow="CAN OS · Registration" title="Course registration rules" outcome={result}/>;
 return <CoursePolicies rows={result.data}/>;
}
type CoursePolicyRow=Awaited<ReturnType<typeof listCoursePolicies>>[number];
function CoursePolicies({rows}:{rows:CoursePolicyRow[]}){
 const router=useRouter();
 const [error,setError]=useState(""),[notice,setNotice]=useState(""),[saving,setSaving]=useState("");
 async function save(sectionId:string,policy:(typeof rows)[number]["policy"]){
  setError("");setNotice("");setSaving(sectionId);
  try{await updateCoursePolicy({data:{sectionId,policy}});await router.invalidate();
   setNotice("Course policy saved and active for subsequent registration decisions.");}
  catch(e){setError(e instanceof Error?e.message:"Unable to save course policy");}
  finally{setSaving("");}
 }
 return <WorkspaceShell eyebrow="CAN OS · Academic operations" title="Course registration policies"
  subtitle="Set the capacity, academic prerequisites, term credit limits, deadlines and timetable conflict group for each section."
  actions={<Link to="/operations" className="rounded-lg border px-3 py-2 text-sm">Operations</Link>}>
  {error&&<p role="alert" className="mt-5 rounded-lg border border-red-500 p-3 text-sm">{error}</p>}
  {notice&&<p role="status" className="mt-5 rounded-lg border p-3 text-sm">{notice}</p>}
  <div className="mt-8 space-y-4">
   {rows.map(r=><CoursePolicyCard key={r.id} row={r}
     disabled={Boolean(saving)} save={policy=>save(r.id,policy)}/>)}
   {!rows.length&&<p className="rounded-xl border p-5 text-sm text-muted-foreground">
    No sections are available. Provision courses in the School Launch workspace first.
   </p>}
  </div>
 </WorkspaceShell>;
}
function CoursePolicyCard({row,save,disabled}:{
 row:CoursePolicyRow,
 disabled:boolean,save:(policy:CoursePolicyRow["policy"])=>Promise<void>
}){
 const [value,setValue]=useState(row.policy);
 const [prerequisites,setPrerequisites]=useState(row.policy.prerequisites.join(", "));
 function update<K extends keyof typeof value>(key:K,updated:(typeof value)[K]){
  setValue(v=>({...v,[key]:updated}));
 }
 return <article className="rounded-xl border bg-card p-5">
  <h2 className="text-lg font-semibold">{row.title} · {row.code}</h2>
  <p className="mt-1 text-xs text-muted-foreground">{row.programName} · {row.startsOn} to {row.endsOn}</p>
  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
   <label className="text-sm">Maximum seats<input type="number" min={1} max={5000} value={value.capacity}
    onChange={e=>update("capacity",Number(e.target.value))} className="mt-1 block w-full rounded border bg-background p-2"/></label>
   <label className="text-sm">Course credits<input type="number" min={0} max={20} step="0.5" value={value.credits}
    onChange={e=>update("credits",Number(e.target.value))} className="mt-1 block w-full rounded border bg-background p-2"/></label>
   <label className="text-sm">Term credit limit<input type="number" min={0} max={40} step="0.5" value={value.maxCreditsPerTerm}
    onChange={e=>update("maxCreditsPerTerm",Number(e.target.value))} className="mt-1 block w-full rounded border bg-background p-2"/></label>
   <label className="text-sm">Add/drop deadline<input type="date" value={value.addDropEndsOn}
    onChange={e=>update("addDropEndsOn",e.target.value)} className="mt-1 block w-full rounded border bg-background p-2"/></label>
   <label className="text-sm">Withdrawal deadline<input type="date" value={value.withdrawalEndsOn}
    onChange={e=>update("withdrawalEndsOn",e.target.value)} className="mt-1 block w-full rounded border bg-background p-2"/></label>
   <label className="text-sm">Meeting conflict key<input value={value.meetingKey??""}
    onChange={e=>update("meetingKey",e.target.value||null)} placeholder="e.g. MWF-0930"
    className="mt-1 block w-full rounded border bg-background p-2"/></label>
   <label className="text-sm sm:col-span-2 lg:col-span-3">Prerequisite course codes (comma-separated)
    <input value={prerequisites} onChange={e=>setPrerequisites(e.target.value)}
     placeholder="ALG-1, BIO-101"
     className="mt-1 block w-full rounded border bg-background p-2"/>
   </label>
  </div>
  <button type="button" disabled={disabled}
   onClick={()=>save({...value,prerequisites:prerequisites.split(",").map(s=>s.trim()).filter(Boolean)})}
   className="mt-4 rounded bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">
   Save policy
  </button>
 </article>;
}

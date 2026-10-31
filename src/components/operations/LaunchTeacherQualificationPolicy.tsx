import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { TeacherPolicyRevisions } from "@/components/profiles/TeacherPolicyRevisions";
import { publishLaunchTeacherPolicy } from "@/modules/programs/launch-academics.functions";
import type { Snapshot } from "@/components/operations/LaunchAcademicSetupWorkspace";

export function LaunchTeacherQualificationPolicy({data,busy,run}:{
 data:Snapshot;
 busy:boolean;
 run:(operation:()=>Promise<unknown>,message:string)=>Promise<void>;
}){
 const router=useRouter();
 const [qualificationKeys,setQualificationKeys]=useState<string[]>([]);
 const [policyConfirmed,setPolicyConfirmed]=useState(false);
 return <>
  <section className="mt-7 rounded-xl border bg-card p-5">
   <h2 className="font-serif text-2xl">Teacher qualification policy</h2>
   {data.policyPublished?<p className="mt-3 text-sm">Program requirements are published. Each instructor is checked against every applicable published policy for the full instructional window.</p>:
    !data.canPublishTeacherPolicy?<p className="mt-3 text-sm">Only a verified, program-scoped institutional staffing-policy publisher can approve the initial teacher qualification requirements. Ask your school administrator to assign that authority.</p>:
    <form className="mt-3 space-y-3" onSubmit={e=>{
     e.preventDefault();void run(()=>publishLaunchTeacherPolicy({data:{
      programId:data.program.id,qualificationKeys,confirmed:true}}),"Teacher qualification policy published.");
    }}>
     <p className="text-sm">Assignment and opening require applicable published policies. Publish this program's reviewed requirements here; jurisdiction, organization and site policies also apply. Select every required qualification; all must be independently verified. Publishing does not certify legal or regulatory compliance.</p>
     <div className="space-y-2">{data.qualificationCatalog.map(qualification=>
      <label key={qualification.key} className="flex items-center gap-2 text-sm">
       <input type="checkbox" checked={qualificationKeys.includes(qualification.key)} onChange={e=>
        setQualificationKeys(keys=>e.target.checked?[...keys,qualification.key]:keys.filter(key=>key!==qualification.key))}/>
       {qualification.title} <span className="text-xs text-muted-foreground">({qualification.key})</span>
      </label>)}</div>
     {!data.qualificationCatalog.length&&<p role="alert" className="text-sm">No qualification catalog entries exist. Configure the shared qualification catalog before publishing requirements.</p>}
     <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={policyConfirmed}
      onChange={e=>setPolicyConfirmed(e.target.checked)}/>
      I confirm these requirements are reviewed for this program and apply to its instructional dates. Published requirements cannot be edited here.
     </label>
     <button disabled={busy||!policyConfirmed||!qualificationKeys.length} type="submit"
      className="rounded border px-3 py-2 text-sm disabled:opacity-50">Publish reviewed requirements</button>
    </form>}
   <TeacherPolicyRevisions programId={data.program.id} policies={data.teacherPolicies}
    catalog={data.qualificationCatalog} canRevise={data.canReviseTeacherPolicy}
    changed={async()=>{await router.invalidate();}}/>
  </section>
 </>;
}

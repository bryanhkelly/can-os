import {useState} from "react";
import {createFileRoute,Link,useRouter} from "@tanstack/react-router";
import {listCoursePolicies,updateCoursePolicy} from "@/modules/learning/registration-policy.functions";
import {safeLoader} from "@/lib/safe-loader";
import {LoaderFailure} from "@/lib/loader-failure";
import {useMutationFeedback} from "@/lib/mutation-feedback";
import {WorkspaceShell, EmptyState, WorkspacePanel, FormSection, ActionFooter} from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/choice";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/ui/field";
export const Route=createFileRoute("/operations/course-policies")({
 loader:safeLoader(()=>listCoursePolicies(),{authMessage:"Sign in as the authorized registrar."}),
 component:CoursePoliciesPage,
});
function CoursePoliciesPage(){
 const result=Route.useLoaderData();
 if(!result.ok)return <LoaderFailure eyebrow="Registration" title="Course registration rules" outcome={result}/>;
 return <CoursePolicies rows={result.data}/>;
}
type CoursePolicyRow=Awaited<ReturnType<typeof listCoursePolicies>>[number];
function CoursePolicies({rows}:{rows:CoursePolicyRow[]}){
 const router=useRouter();
 const mutation=useMutationFeedback(()=>router.invalidate());
 const saving=mutation.pending||mutation.refreshFailed;
 const selection=Route.useSearch();
 const visibleRows=rows.filter(row=>(!selection.siteId||row.siteId===selection.siteId)&&(!selection.programId||row.programId===selection.programId));
 async function save(sectionId:string,policy:(typeof rows)[number]["policy"]){
  await mutation.run(
   ()=>updateCoursePolicy({data:{sectionId,policy}}),
   {
    successMessage:"Course policy saved and active for subsequent registration decisions.",
    commandErrorMessage:"Unable to save course policy.",
   },
  );
 }
 return <WorkspaceShell eyebrow="Academic operations" title="Course registration policies"
  subtitle="Set enrollment limits, academic prerequisites, credit rules and registration deadlines. Schedule conflicts use the section’s canonical timetable."
  actions={<div className="flex flex-wrap gap-2">
   <Button asChild variant="outline"><Link to="/operations/course-requests" search={{siteId:selection.siteId,programId:selection.programId}}>Registration requests</Link></Button>
   <Button asChild variant="outline"><Link to="/home" search={{siteId:selection.siteId,programId:selection.programId}}>Operations</Link></Button>
  </div>}>
  <MutationFeedback state={mutation} className="mt-5" pendingMessage="Saving course policy..."/>
  <div className="mt-8 space-y-4">
   {visibleRows.map(r=><CoursePolicyCard key={r.id} row={r}
     disabled={Boolean(saving)} save={policy=>save(r.id,policy)}/>)}
   {!visibleRows.length&&<EmptyState title="No sections available" description="Provision courses in the School Launch workspace first."/>}
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
 return <WorkspacePanel title={`${row.title} · ${row.code}`} description={`${row.programName} · ${row.startsOn} to ${row.endsOn}`}>
  <FormSection title="Registration rules">
   <Field label="Maximum seats"><Input type="number" min={1} max={5000} value={value.capacity}
    onChange={e=>update("capacity",Number(e.target.value))}/></Field>
   <Field label="Course credits"><Input type="number" min={0} max={20} step="0.5" value={value.credits}
    onChange={e=>update("credits",Number(e.target.value))}/></Field>
   <Field label="Term credit limit"><Input type="number" min={0} max={40} step="0.5" value={value.maxCreditsPerTerm}
    onChange={e=>update("maxCreditsPerTerm",Number(e.target.value))}/></Field>
   <Field label="Add/drop deadline"><Input type="date" value={value.addDropEndsOn}
    onChange={e=>update("addDropEndsOn",e.target.value)}/></Field>
   <Field label="Withdrawal deadline"><Input type="date" value={value.withdrawalEndsOn}
    onChange={e=>update("withdrawalEndsOn",e.target.value)}/></Field>
   <Field label="Prerequisite course codes (comma-separated)" className="sm:col-span-2">
    <Input value={prerequisites} onChange={e=>setPrerequisites(e.target.value)}
     placeholder="ALG-1, BIO-101"
     />
   </Field>
  </FormSection>
  <Label className="mt-4 flex items-start gap-3  border p-3 text-sm">
    <Checkbox checked={value.guardianApprovalRequired}
      onChange={e=>update("guardianApprovalRequired",e.target.checked)} className="mt-1"/>
    <span>Require verified guardian approval before a registrar may approve this class addition.
      Student requests remain pending until an authorized guardian records their decision.</span>
  </Label>
  <ActionFooter layout="form"><Button type="button" disabled={disabled}
   onClick={()=>save({...value,prerequisites:prerequisites.split(",").map(s=>s.trim()).filter(Boolean)})}
   >
   Save policy
  </Button></ActionFooter>
 </WorkspacePanel>;
}
import { MutationFeedback } from "@/components/workspace/mutation-feedback";

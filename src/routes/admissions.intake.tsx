import { useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { AdmissionsApplicantCard } from "@/components/admissions/AdmissionsApplicantCard";
import type { AdmissionsDecision } from "@/components/admissions/AdmissionsDecisionActions";
import type { GuardianVerification } from "@/components/admissions/AdmissionsGuardianActions";
import {useEffect,useState} from "react";
import {createFileRoute,Link,redirect,useRouter} from "@tanstack/react-router";
import {getAdmissionsStageCounts,listAdmissionsIntake,listAdmissionsIntakePrograms,provisionInquiryGuardianAccount,sendAdmissionsGuardianInvitation,verifyAdmissionsGuardianRelationship,transitionAdmissionsStage} from "@/modules/enrollment/admissions-intake.functions";
import {safeLoader} from "@/lib/safe-loader";
import {LoaderFailure} from "@/lib/loader-failure";
import {CreateAction, DirectoryTable, EmptyState, PageFrame, RecordHeader, RecordLayout, StatusBadge, WorkspaceNotice, WorkspacePanel, WorkspaceShell} from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PublicInterestInbox } from "@/components/admissions/PublicInterestInbox";
import { AdmissionsPageNavigation } from "@/components/admissions/AdmissionsPageNavigation";
import { AdmissionsPipelineSummary } from "@/components/admissions/AdmissionsPipelineSummary";
import { listPublicAdmissionsInterests } from "@/modules/enrollment/public-admissions-interest.functions";
import {z} from "zod";
import {optionalSearchString,siteProgramSelectionSchema} from "@/lib/route-search";
const intakeSearchSchema=siteProgramSelectionSchema.extend({
 page:z.number().int().safe().positive().catch(1),
 studentPage:z.number().int().safe().positive().catch(1),
 search:optionalSearchString.transform(value=>value?.slice(0,100)),
 application:optionalSearchString,
 interest:optionalSearchString,
});
const load=async(selection:{interest?:string;siteId?:string;programId?:string;page?:number;studentPage?:number;search?:string;application?:string})=>{
 const [records,publicInterests,stageCounts,programs]=await Promise.all([
  listAdmissionsIntake({data:{siteId:selection.siteId,programId:selection.programId,page:selection.page??1,search:selection.application?undefined:selection.search,applicationId:selection.application}}),
  listPublicAdmissionsInterests({data:{siteId:selection.siteId,programId:selection.programId}}),
  getAdmissionsStageCounts({data:{siteId:selection.siteId,programId:selection.programId,search:selection.search}}),
  listAdmissionsIntakePrograms(),
 ]);
 return {records,publicInterests,stageCounts,programs};
};
export const Route=createFileRoute("/admissions/intake")({
 validateSearch:(search:Record<string,unknown>):{application?:string;siteId?:string;programId?:string;interest?:string;page?:number;studentPage?:number;search?:string}=>intakeSearchSchema.parse(search),
 beforeLoad:({search})=>{
  if(search.interest&&!search.application)throw redirect({to:"/admissions/intake/new",search:{siteId:search.siteId,programId:search.programId,interest:search.interest,studentPage:search.studentPage},replace:true});
 },
 loaderDeps:({search})=>({interest:search.interest,siteId:search.siteId,programId:search.programId,page:search.page,studentPage:search.studentPage,search:search.search,application:search.application}),
 loader:({deps})=>safeLoader(()=>load(deps),{authMessage:"Sign in as a registrar to manage admissions."})(),
 component:IntakePage
});
function IntakePage(){
 const outcome=Route.useLoaderData();
 const selected=Route.useSearch();
 if(!outcome.ok)return <LoaderFailure eyebrow="Admissions" title="Inquiry and decision pipeline" outcome={outcome}/>;
 return <Intake key={`${selected.siteId??""}:${selected.programId??""}:${selected.interest??""}:${selected.studentPage??1}:${selected.application??""}`} data={outcome.data}/>;
}
function Intake({data}:{data:Awaited<ReturnType<typeof load>>}){
 const router=useRouter();
 const selected=Route.useSearch();
 const scopedRecords=data.records.items.filter(row=>(!selected.siteId||row.siteId===selected.siteId)&&
  (!selected.programId||row.programId===selected.programId));
 const records=scopedRecords.filter(row=>!selected.application||row.id===selected.application);
 const [searchDraft,setSearchDraft]=useState(selected.search??"");
 const pageNavigation=<div className="my-4 flex flex-wrap items-center gap-3">
  <form className="flex flex-wrap items-end gap-2" onSubmit={e=>{e.preventDefault();void router.navigate({to:"/admissions/intake",search:{...selected,search:searchDraft||undefined,page:1}});}}>
   <Field label="Search admissions" description="Search students, Programs, or application IDs.">
    <Input value={searchDraft} onChange={e=>setSearchDraft(e.target.value)} placeholder="Student, program, application ID"/>
   </Field>
   <Button type="submit" variant="outline">Search</Button>
  </form>
 </div>;

 const mutation=useMutationFeedback(()=>router.invalidate());
 const [interactive,setInteractive]=useState(false);
 const [issuedCredential,setIssuedCredential]=useState<{applicationId:string;email:string;code:string}|null>(null);
 useEffect(()=>setInteractive(true),[]);
 const busy=mutation.pending||mutation.refreshFailed||!interactive;
 async function perform<T>(fn:()=>Promise<T>,message:string|((value:T)=>string),refresh?:()=>Promise<unknown>){
  await mutation.run(fn,{successMessage:message,commandErrorMessage:"Unable to save",refresh});
 }
 const onVerify=(applicationId:string,verification:GuardianVerification)=>{
  void perform(()=>verifyAdmissionsGuardianRelationship({data:{applicationId,...verification}}),
   "Guardian relationship verified and family permissions enabled.");
 };
 const onProvision=(applicationId:string)=>{
  setIssuedCredential(null);
  void perform(async()=>{
   const result=await provisionInquiryGuardianAccount({data:{applicationId}});
   if("privateAccessCode" in result && typeof result.privateAccessCode==="string")setIssuedCredential({applicationId,email:result.email,code:result.privateAccessCode});
   return result;
  },"Verified guardian sign-in access provisioned.");
 };
 const onInvite=(applicationId:string)=>void perform(()=>sendAdmissionsGuardianInvitation({data:{applicationId}}),
  result=>result.signInMethod==="email_link"?"A secure email sign-in invitation was requested for this guardian.":"Guardian access is provisioned. Use the existing authorized credential; no email is sent to this address.");
 const onDecision=(applicationId:string,decision:AdmissionsDecision,label:string)=>{
  void perform(()=>transitionAdmissionsStage({data:{applicationId,decision}}),label+" saved.");
 };
 if(selected.application){
  const record=records[0];
  return <PageFrame width="wide">
   <RecordLayout header={<RecordHeader eyebrow="Admissions / Application"
    title={record?`${record.studentFirst} ${record.studentLast}`:"Application unavailable"}
    subtitle={record?`${record.programName} · Last updated ${new Date(record.updatedAt).toLocaleDateString()}`:
     "This application is unavailable in your authorized Site and Program scope."}
    status={record?<StatusBadge>{record.disposition??record.stage}</StatusBadge>:undefined}
    focusOnMount
    breadcrumbs={<Link to="/admissions/intake" search={{...selected,application:undefined}} className="underline">Admissions pipeline</Link>}/>}
   main={record ? (
    <div className="space-y-5">
     <MutationFeedback state={mutation} pendingMessage="Saving admissions records..."/>
     {issuedCredential?.applicationId===record.id&&<WorkspacePanel title="Guardian private access code"><WorkspaceNotice>Transfer this one-time-displayed credential privately to the independently verified guardian at {issuedCredential.email}. Do not email or post it.</WorkspaceNotice><Field label="Private access code"><Input value={issuedCredential.code} readOnly autoComplete="off" /></Field><Button type="button" variant="outline" onClick={()=>setIssuedCredential(null)}>Dismiss code</Button></WorkspacePanel>}
    <AdmissionsApplicantCard r={record} busy={busy} showSummary={false} onVerify={onVerify}
      onProvision={onProvision} onInvite={onInvite} onDecision={onDecision}/>
    </div>
   ) : (
    <EmptyState title="Application unavailable"
     description="This application is unavailable in your authorized Site and Program scope."/>
   )} />
  </PageFrame>;
 }
 return <WorkspaceShell eyebrow="Admissions" title="Admissions pipeline"
  subtitle="Capture family inquiries, qualify applicants, record decisions and hand accepted applications into enrollment."
  actions={<Button asChild variant="outline"><Link to="/admissions" search={{siteId:selected.siteId,programId:selected.programId,application:selected.application}}>Offers & enrollment</Link></Button>}>
  <div className="mt-5"><CreateAction><Link to="/admissions/intake/new" search={{siteId:selected.siteId,programId:selected.programId}}>New inquiry</Link></CreateAction></div>
  <MutationFeedback state={mutation} pendingMessage="Saving admissions records..." className="mt-5"/>
  <PublicInterestInbox initialPage={data.publicInterests} availablePrograms={data.programs}
    siteId={selected.siteId} programId={selected.programId}/>
  <AdmissionsPipelineSummary counts={data.stageCounts}/>
  <WorkspacePanel title="Applicants and next actions" className="mt-8">
   {pageNavigation}
   <DirectoryTable label="Admissions applicants" caption="Authorized applications for the selected Site and Program."
    rows={records} rowKey={record=>record.id}
    columns={[
     {id:"student",title:"Student",render:record=><Link to="/admissions/intake" search={{...selected,application:record.id}} className="font-medium underline">{record.studentFirst} {record.studentLast}</Link>},
     {id:"program",title:"Program",render:record=>record.programName},
     {id:"stage",title:"Stage",render:record=><StatusBadge>{record.disposition??record.stage}</StatusBadge>},
     {id:"updated",title:"Last updated",render:record=>new Date(record.updatedAt).toLocaleDateString()},
    ]}
    rowActions={[{id:"review",label:"Review application",allowed:()=>true,onClick:record=>{void router.navigate({to:"/admissions/intake",search:{...selected,application:record.id}});}}]}
    pagination={<AdmissionsPageNavigation selection={selected} hasMore={data.records.hasMore} kind="applications"/>}
    empty={<EmptyState title="No applications found" description="No applications recorded in your authorized programs match the current search."/>}/>
  </WorkspacePanel>
 </WorkspaceShell>;
}

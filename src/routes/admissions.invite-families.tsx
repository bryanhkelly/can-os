import {createFileRoute,Link,useRouter} from "@tanstack/react-router";
import {useState,type FormEvent} from "react";
import {WorkspaceShell} from "@/components/workspace";
import {FamilyInvitationBatchList,FamilyInvitationFeedback} from "@/components/admissions/FamilyInvitationBatchList";
import {FamilyInvitationForm} from "@/components/admissions/FamilyInvitationForm";
import {safeLoader} from "@/lib/safe-loader";
import {LoaderFailure} from "@/lib/loader-failure";
import {
  listFamilyInvitations,sendFamilyInvitations,retryFamilyInvitationBatch,
} from "@/modules/enrollment/family-invitations.functions";

export const Route=createFileRoute("/admissions/invite-families")({
 loader:safeLoader(()=>listFamilyInvitations(),{
  authMessage:"Sign in as a receiving-school registrar to invite prospective families.",
 }),
 component:FamilyInvitationsPage,
});
type Data=Awaited<ReturnType<typeof listFamilyInvitations>>;
function FamilyInvitationsPage(){
 const result=Route.useLoaderData();
 if(!result.ok)return <LoaderFailure eyebrow="CAN OS · Admissions"
  title="Invite prospective families" outcome={result}/>;
 return <FamilyInvitationsWorkspace data={result.data}/>;
}
function FamilyInvitationsWorkspace({data}:{data:Data}){
 const router=useRouter();
 const eligible=data.programs.filter(program=>program.purpose==="application");
 const [programId,setProgramId]=useState(eligible[0]?.id??"");
 const [contacts,setContacts]=useState("");
 const [introduction,setIntroduction]=useState("You're invited to start an application at our school. Please verify your email using the private secure link in this invitation. This is not an offer of enrollment.");
 const [subject,setSubject]=useState("Invitation to apply to our school");
 const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[error,setError]=useState("");
 async function submit(event:FormEvent){
  event.preventDefault();
  if(busy||!programId||!contacts.trim())return;
  if(!window.confirm("Queue secure application invitations to the listed family email addresses? This does not verify legal guardianship, accept an application, or enroll a child."))return;
  setBusy(true);setError("");setNotice("");
  try{
   const result=await sendFamilyInvitations({data:{
    requestId,programId,rawContacts:contacts,subject,introduction,
    purpose:"application",confirmed:true,
   }});
   setNotice(result.created
    ?result.recipientCount+" secure application invitation(s) queued. Provider delivery and family response appear below."
    :"This invitation request is already queued. No duplicate invitations were created.");
   setRequestId(crypto.randomUUID());setContacts("");
   try{await router.invalidate();}
   catch{setError("The batch was queued but the status list could not refresh. Do not resubmit the same recipients.");}
  }catch(e){setError(e instanceof Error?e.message:"Unable to queue family invitations.");}
  finally{setBusy(false);}
 }
 async function retry(batchId:string){
  if(busy)return;
  setBusy(true);setNotice("");setError("");
  try{
   const result=await retryFamilyInvitationBatch({data:{batchId}});
   setNotice(result.retried>0?result.retried+" unaccepted invitation(s) queued for retry. Already accepted recipients will not be sent again.":"No unaccepted failed recipients remain in this batch.");
   await router.invalidate();
  }catch(e){setError(e instanceof Error?e.message:"Could not retry invitations.");}
  finally{setBusy(false);}
 }
 return <WorkspaceShell eyebrow="CAN OS · Admissions" title="Invite families to apply"
  subtitle="Send verified-email enrollment invitations to prospective families, including transfers from another school. The receiving-school registrar controls the invitation; no child identity or admissions decision is inferred."
  actions={<Link to="/admissions" className="rounded border px-3 py-2 text-sm">Admissions</Link>}>
  <FamilyInvitationFeedback notice={notice} error={error}/>
  <FamilyInvitationForm programs={eligible} draft={{programId,contacts,subject,introduction}} busy={busy}
   onChange={patch=>{
    if(patch.programId!==undefined)setProgramId(patch.programId);
    if(patch.contacts!==undefined)setContacts(patch.contacts);
    if(patch.subject!==undefined)setSubject(patch.subject);
    if(patch.introduction!==undefined)setIntroduction(patch.introduction);
   }} onSubmit={event=>void submit(event)}/>
  <FamilyInvitationBatchList batches={data.batches} busy={busy} onRetry={batchId=>void retry(batchId)}/>
 </WorkspaceShell>;
}

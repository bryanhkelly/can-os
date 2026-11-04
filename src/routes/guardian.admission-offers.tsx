import {useEffect,useState} from "react";
import {createFileRoute,useRouter,Link} from "@tanstack/react-router";
import {getGuardianAdmissionOffers} from "@/modules/enrollment/guardian-admission-offers.functions";
import {respondToAdmissionOffer} from "@/modules/enrollment/admissions-offer.functions";
import {safeLoader} from "@/lib/safe-loader";
import {LoaderFailure} from "@/lib/loader-failure";
import {GuardianEnrollmentChecklist} from "@/components/enrollment/GuardianEnrollmentChecklist";
import {StudentLearningAccessHandoff} from "@/components/enrollment/StudentLearningAccessHandoff";
import {EmptyState,StatusBadge,WorkspaceNotice,WorkspacePanel,WorkspaceShell} from "@/components/workspace";
import {Button} from "@/components/ui/button";
import {ActionDialog} from "@/components/workspace/action-dialog";
import {MutationFeedback} from "@/components/workspace/mutation-feedback";
import {useMutationFeedback} from "@/lib/mutation-feedback";

const loadGuardianOffers=(studentPersonId?:string)=>getGuardianAdmissionOffers({data:{studentPersonId}});
export const Route=createFileRoute("/guardian/admission-offers")({
 validateSearch:(search:Record<string,unknown>):{student?:string;offer?:string;application?:string}=>({
  student:typeof search.student==="string"?search.student:undefined,
  offer:typeof search.offer==="string"?search.offer:undefined,
  application:typeof search.application==="string"?search.application:undefined,
 }),
 loaderDeps:({search})=>({student:search.student}),
 loader:({deps})=>safeLoader(()=>loadGuardianOffers(deps.student),{
  authMessage:"Sign in with an authorized guardian account to view enrollment offers.",
 })(),
 component:GuardianAdmissionOffers
});
function GuardianAdmissionOffers(){
 const outcome=Route.useLoaderData();
 if(!outcome.ok)return <LoaderFailure title="Enrollment offers" outcome={outcome}/>;
 return <GuardianAdmissionOffersView applications={outcome.data}/>;
}
function GuardianAdmissionOffersView({applications}:{applications:Awaited<ReturnType<typeof loadGuardianOffers>>}){
 const router=useRouter();
 const {student,offer,application}=Route.useSearch();
 const [checklist,setChecklist]=useState<string|null>(null);
 const mutation=useMutationFeedback(()=>router.invalidate());
 const [declineTarget,setDeclineTarget]=useState<{offerId:string;studentName:string;program:string}|null>(null);
 const [interactive,setInteractive]=useState(false);
 useEffect(()=>setInteractive(true),[]);
 const busy=!interactive||mutation.pending||mutation.refreshFailed;
 async function respond(offerId:string,decision:"accept"|"decline"){
  const result=await mutation.run(()=>respondToAdmissionOffer({data:{offerId,decision}}),{
   successMessage:decision==="accept"?"Offer accepted. Your school will complete the remaining enrollment and class placement steps.":"Offer declined. Your school has been notified.",
   commandErrorMessage:"Unable to respond to offer.",
  });
  if(result.status==="saved"||result.status==="refresh-failed")setDeclineTarget(null);
 }
 return <WorkspaceShell eyebrow="Family" title="Enrollment offers"
  subtitle="Review offers for students whose enrollment you are authorized to manage."
  breadcrumbs={<Link to="/home" className="underline">Family home</Link>}
  actions={<Link to="/guardian/apply" className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">View or start application</Link>}>
  <div className="space-y-6">
  {student&&<Link to="/guardian/admission-offers" className="inline-block text-xs font-semibold underline">View offers for all children →</Link>}
  {!declineTarget&&<MutationFeedback state={mutation} pendingMessage="Saving offer response..."/>}
  <ActionDialog open={!!declineTarget} title="Decline school offer?"
    description={`Decline the offer for ${declineTarget?.studentName ?? "this student"} at ${declineTarget?.program ?? "this school"}? The school will be notified and you may need to contact admissions to reapply.`}
    confirmLabel="Decline offer" destructive pending={mutation.pending} confirmDisabled={busy}
    onClose={()=>setDeclineTarget(null)}
    onConfirm={()=>{if(declineTarget)void respond(declineTarget.offerId,"decline");}}>
    <MutationFeedback state={mutation} pendingMessage="Saving offer response..."/>
  </ActionDialog>
  {offer&&<Link to="/guardian/admission-offers" search={{student}} className="inline-block text-sm underline">View all offers for this child</Link>}
  {offer&&!applications.some(app=>app.offers.some(item=>item.id===offer))&&<WorkspaceNotice tone="danger">This offer is unavailable in your current family workspace.</WorkspaceNotice>}
  {application&&!applications.some(app=>app.applicationId===application)&&<WorkspaceNotice tone="danger">This enrollment application is unavailable in your current family workspace.</WorkspaceNotice>}
  {application&&<Link to="/guardian/admission-offers" search={{student}} className="inline-block text-sm underline">View all enrollment applications</Link>}
  {applications.filter(app=>(!application||app.applicationId===application)&&(!offer||app.offers.some(item=>item.id===offer))).map(app=><WorkspacePanel key={app.applicationId} title={app.studentName} description={app.program}>
    {app.transferOriginExited===false&&<WorkspaceNotice tone="info" className="mt-3">
      Your original school has not completed the institutional transfer exit. You may continue your receiving-school application and review any offer, but enrollment and classroom placement cannot be activated yet.
    </WorkspaceNotice>}
    {app.transferOriginExited===true&&<p role="status" className="mt-2 text-sm">
      Origin-school exit completed. Your receiving school still must complete the independent offer and class placement process.
    </p>}
    {app.waitlisted&&!app.offers.some(o=>o.enrollmentActive||o.status==="accepted"||o.progress.canAccept)&&<p role="status" className="mt-2 text-sm">Application waitlisted. Contact admissions about availability and next steps.</p>}
    {(app.applicationStage==="withdrawn"||app.applicationStage==="declined")&&<p role="status" className="mt-2 text-sm">Application {app.applicationStage}. Contact admissions if your plans change.</p>}
    <section aria-label="Your next enrollment step" className="mt-4 rounded-xl border border-primary/30 bg-muted/30 p-4">
     <p className="text-xs font-bold uppercase tracking-widest text-primary">Your next step</p>
     {app.offers.some(o=>o.enrollmentActive&&o.sectionCount>0)?<p className="mt-2 text-sm">School-year enrollment and instructional class placement are active. Review separate student sign-in authorization, attendance and pickup arrangements before the first onsite day. This is not confirmation of attendance.</p>:
      app.offers.some(o=>o.enrollmentActive)?<p className="mt-2 text-sm">Your child's school-year enrollment is active, but a staffed instructional class has not yet been assigned. The school must complete class placement before learning access or onsite attendance can begin.</p>:
      app.offers.some(o=>o.status==="accepted")?<p className="mt-2 text-sm">Your offer is accepted. Complete any requested forms and watch for confirmation from the school that enrollment and class placement are active.</p>:
      app.offers.some(o=>o.progress.canAccept)?<p className="mt-2 text-sm">An offer is ready for your decision. Review the details below and accept or decline before the deadline.</p>:
      app.offers.some(o=>o.progress.state==="requirements_pending")?<p className="mt-2 text-sm">The school needs to review enrollment requirements before this offer can be accepted. Open the checklist below to see outstanding items.</p>:
      app.waitlisted?<p className="mt-2 text-sm">Your application is on the waitlist. Contact the school about availability; there is no offer to accept right now.</p>:
      app.offers.some(o=>o.progress.state==="expired")?<p className="mt-2 text-sm">The previous offer has expired. Contact admissions about next steps; an expired offer cannot be accepted.</p>:
      <p className="mt-2 text-sm">Review your application checklist for outstanding forms. Your school will notify you when an offer is available.</p>}
    </section>
    <Button variant="outline" aria-expanded={checklist===app.applicationId||application===app.applicationId}
      className="mt-3" onClick={()=>setChecklist(app.applicationId)}>View enrollment checklist</Button>
    {(checklist===app.applicationId||application===app.applicationId)&&<GuardianEnrollmentChecklist key={app.applicationId} applicationId={app.applicationId}/>}
    {app.offers.filter(item=>!offer||item.id===offer).map(o=><div className="mt-3 border-t pt-3" key={o.id}>
     <StatusBadge tone={o.status==="accepted"?"success":o.status==="issued"?"info":o.status==="declined"||o.status==="revoked"?"danger":"neutral"}>Offer status: {o.status}</StatusBadge>
     {o.expiresAt&&<p className="mt-2 text-xs text-muted-foreground">Expires {new Date(o.expiresAt).toLocaleDateString()}</p>}
     <p className="mt-2 text-sm">School year: {o.schoolYearName}</p>
     <p role="status" className="mt-2 text-sm">{o.progress.message}</p>
     {!o.enrollmentActive&&app.blockers.length>0&&<ul aria-label="Enrollment requirements awaiting review" className="mt-2 list-inside list-disc text-sm">
       {app.blockers.map(requirement=><li key={requirement.id}>{requirement.title} · {requirement.status.replaceAll("_"," ")}</li>)}
     </ul>}
     {o.status==="issued"&&!o.enrollmentActive&&(!o.expiresAt||new Date(o.expiresAt).getTime()>Date.now())&&<div className="mt-3 flex gap-3">
       <Button variant="outline" disabled={busy||!o.progress.canAccept} onClick={()=>void respond(o.id,"accept")}>Accept</Button>
       <Button variant="outline" disabled={busy} onClick={()=>setDeclineTarget({offerId:o.id,studentName:app.studentName,program:app.program})}>Decline</Button>
     </div>}
     {o.enrollmentActive&&<div className="mt-3 space-y-2">
       <p className="text-sm">{o.sectionCount
        ? `${o.sectionCount} assigned ${o.sectionCount===1?"class":"classes"} — review the separate student sign-in requirements below before your child logs in.`
        : "Enrollment is active; the school has not assigned a class yet."}</p>
       {o.sectionCount>0&&<StudentLearningAccessHandoff
         applicationId={app.applicationId} role="guardian"/>}
       <div className="flex flex-wrap gap-3 text-sm">
        {o.sectionCount>0&&<Link to="/classes" search={{student:app.studentPersonId}}
          className="rounded-lg border px-3 py-2 font-semibold">Open your child's classes →</Link>}
        <Link to="/guardian/attendance" search={{student:app.studentPersonId}}
         className="rounded-lg border px-3 py-2">Attendance and excuses →</Link>
        <Link to="/guardian/attendance" search={{student:app.studentPersonId}} hash="pickup"
         className="rounded-lg border px-3 py-2">Set up pickup and safety before the first school day →</Link>
        <Link to="/home" className="rounded-lg border px-3 py-2">Family home →</Link>
       </div>
     </div>}
    </div>)}{app.offers.length===0&&<div className="mt-3">
      <EmptyState title="No enrollment offer has been issued yet."
       description={`Your school is reviewing this application (${app.applicationStage.replaceAll("_", " ")}). Use the enrollment checklist to complete any requested forms or corrections. An application is not an active enrollment or class assignment.`}/>
      {app.blockers.length>0&&<p className="mt-2 text-sm">
        {app.blockers.length} required {app.blockers.length===1?"item needs":"items need"} review.
      </p>}
      <Button variant="outline" className="mt-3"
        onClick={()=>setChecklist(app.applicationId)}>Review enrollment checklist →</Button>
     </div>}
  </WorkspacePanel>)}
  {applications.length===0&&<div>
    <EmptyState title="No verified enrollment applications or offers are available for this family membership."
     description="A new family application may still be pending independent guardian verification. You can review applications submitted with your verified email sign-in."/>
    <Link to="/guardian/apply" className="mt-3 inline-block rounded border px-3 py-2 text-sm font-semibold">
      View or start my application →
    </Link>
  </div>}
  <Link to="/home" className="text-sm underline">Back to family home →</Link>
  </div>
 </WorkspaceShell>;
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useState, type ReactNode } from "react";
import { WorkspaceShell, StatusBadge } from "@/components/workspace";
import { NativeClassHomeNavigation } from "@/components/learning/NativeClassHomeNavigation";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/choice";
import { Button } from "@/components/ui/button";
import { normalizeClientError } from "@/lib/client-error";
import {
  getNativePublicClassCatalogPage, getMyNativeClassEnrollmentHistoryPage,
} from "@/modules/classes/native-class-enrollment.functions";
import { getMyNativeClassInvitations, declineNativeClassInvitation } from
  "@/modules/classes/native-class-invitations.functions";
import {requestNativeClassApproval,getMyNativeClassApprovals} from "@/modules/classes/native-class-approvals.functions";
import {transferMyNativeClassEnrollment} from "@/modules/classes/native-class-transfers.functions";
import { withdrawMyNativeClassEnrollment } from
  "@/modules/classes/native-class-lifecycle.functions";
import { resumeLinkedNativeClassLearner } from "@/modules/classes/native-class-session-recovery.functions";
import { enrollCurrentPersonInClass } from "@/modules/classes/native-class-entry.client";

/** Load privileged Class management composition only when requested,
 * keeping the public Class directory and enrollment entry lightweight. */
const NativeClassManager=lazy(async()=>{
  const module=await import("@/components/learning/NativeClassManager");
  return {default:module.NativeClassManager};
});
/** Publisher Course activity authoring is available through the same /class
 * entry, without pulling its sensitive editing UI into public discovery. */
const PublisherCourseActivityEditor=lazy(async()=>{
  const module=await import("@/components/learning/PublisherCourseActivityEditor");
  return {default:module.PublisherCourseActivityEditor};
});

const classUuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function selectedClassUuid(value:unknown):string|undefined{
  return typeof value==="string"&&classUuidPattern.test(value)?value:undefined;
}

export const Route=createFileRoute("/class")({
  validateSearch:(value:Record<string,unknown>):{search?:string;classId?:string;siteId?:string;offeringVersionId?:string;courseVersionId?:string;view?:"manage"|"activities"}=>({
    view:value.view==="manage"||value.view==="activities"?value.view:undefined,
    search:typeof value.search==="string"&&value.search.trim().length<=100
      ?value.search.trim():undefined,
    classId:selectedClassUuid(value.classId),
    siteId:selectedClassUuid(value.siteId),
    offeringVersionId:selectedClassUuid(value.offeringVersionId),
    courseVersionId:selectedClassUuid(value.courseVersionId),
  }),
  component:ClassHome,
});
type Item=Awaited<ReturnType<typeof getNativePublicClassCatalogPage>>["items"][number];
type CreditMode="for_credit"|"audit"|"not_applicable";
const creditName:Record<CreditMode,string>={
  for_credit:"For credit (eligibility required)",
  audit:"Audit, no academic credit",not_applicable:"No academic credit",
};

function OfferingCard({item,onJoined}:{item:Item;onJoined:()=>Promise<void>}){
  const [mode,setMode]=useState<CreditMode>((item.allowedCreditModes[0]??"not_applicable") as CreditMode);
  const [adult,setAdult]=useState(false);
  const [consent,setConsent]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const self=item.enrollmentMethods.includes("self");
  const approvalRequired=!self&&item.enrollmentMethods.includes("approval");
  const full=item.remainingSeats===0;
  async function requestApproval(){
    if(!approvalRequired||busy)return;
    setBusy(true);setMessage("");setError("");
    try{
      const result=await requestNativeClassApproval({data:{
        classOfferingVersionId:item.classOfferingVersionId,requestId:crypto.randomUUID(),
      }});
      setMessage(result.duplicate?"Your request was already received.":
        "Request submitted for independent review. No seat is reserved until approval is accepted.");
      await onJoined();
    }catch(e){setError(normalizeClientError(e,"Class approval request was not submitted.").message)}
    finally{setBusy(false)}
  }
  async function enroll(){
    if(!self||full||!adult||!consent||busy)return;
    setBusy(true);setMessage("");setError("");
    try{
      // A verified, previously bound adult should not need to discover a
      // separate native-login recovery action before joining a Class.
      // The server independently validates the CAN account, native Person,
      // adulthood and current learner grant before issuing the cookie.
      // Never silently create or impersonate a native account here.
      const result=await enrollCurrentPersonInClass({data:{
        classOfferingVersionId:item.classOfferingVersionId,
        creditMode:mode,adultAttested:true,consentAccepted:true,
      }});
      setMessage(result.alreadyEnrolled?"You are already enrolled.":"Enrollment confirmed. Your Course Attempt is ready.");
      await onJoined();
    }catch(e){setError(normalizeClientError(e,"Class enrollment was not completed.").message)}
    finally{setBusy(false)}
  }
  return <article className="border border-border bg-card p-5">
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {item.deliveryMode.replace("_"," ")} · {item.siteId?"Site hosted":"Online"}
    </p>
    <h3 className="mt-2 font-serif text-xl">{item.classTitle}</h3>
    {full?<p role="status" className="mt-2 text-sm font-semibold">
      Class full. Enrollment is unavailable until a seat is released.
    </p>:item.remainingSeats!==null?
      <p className="mt-2 text-sm text-muted-foreground">
        {item.remainingSeats} of {item.capacity} seats currently available
      </p>:<p className="mt-2 text-sm text-muted-foreground">
        Seats available; no published numerical limit
      </p>}
    {self?<>
      <div className="mt-4">
        <label className="block text-sm font-semibold" htmlFor={"class-credit-"+item.classOfferingVersionId}>Participation</label>
        <select id={"class-credit-"+item.classOfferingVersionId} value={mode}
          onChange={e=>setMode(e.target.value as CreditMode)}
          className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm">
          {item.allowedCreditModes.map(m=><option key={m} value={m}>{creditName[m]}</option>)}
        </select>
      </div>
      <div className="mt-4 border border-border bg-muted/20 p-3">
        <p className="text-sm font-semibold">Participation and data-use terms</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{item.consentText}</p>
      </div>
      <label className="mt-4 flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1"
        checked={adult} onChange={e=>setAdult(e.target.checked)}/>
        I confirm that I am at least 18. Class admission requires a separately verified adult learner identity.
      </label>
      <label className="mt-3 flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1"
        checked={consent} onChange={e=>setConsent(e.target.checked)}/>
        I have read and accept these participation and data-use terms.
      </label>
      <Button className="mt-4" disabled={!adult||!consent||busy||full} onClick={()=>void enroll()}>
        {busy?"Enrolling…":full?"Class full":"Enroll in Class"}
      </Button>
    </>:approvalRequired?<div className="mt-4">
      <p className="text-sm text-muted-foreground">Approval required. Staff review eligibility independently. A request is not a seat reservation or enrollment.</p>
      <Button className="mt-4" disabled={busy||full} onClick={()=>void requestApproval()}>
        {busy?"Submitting…":"Request approval"}</Button>
    </div>:<p className="mt-4 text-sm text-muted-foreground">
      This Class is available by {item.enrollmentMethods.join(", ")}. Self-enrollment is not enabled.
    </p>}
    {message&&<p role="status" className="mt-3 text-sm">{message}</p>}
    {error&&<p role="alert" className="mt-3 text-sm">{error}</p>}
  </article>;
}
type NativeApproval=Awaited<ReturnType<typeof getMyNativeClassApprovals>>[number];
function ApprovedClassCard({item,onChanged}:{item:NativeApproval;onChanged:()=>Promise<void>}){
  const [mode,setMode]=useState<CreditMode>((item.allowedCreditModes[0]??"not_applicable") as CreditMode);
  const [adult,setAdult]=useState(false);
  const [consent,setConsent]=useState(false);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const eligible=item.state==="approved"&&!item.acceptedEnrollmentId;
  async function accept(){
    if(!eligible||!adult||!consent||busy)return;
    setBusy(true);setNotice("");setError("");
    try{
      await enrollCurrentPersonInClass({data:{
        classOfferingVersionId:item.classOfferingVersionId,
        approvalRequestId:item.approvalRequestId,
        creditMode:mode,adultAttested:true,consentAccepted:true,
      }});
      setNotice("Approved Class enrollment accepted. Your Course Attempt is ready.");
      await onChanged();
    }catch(e){setError(normalizeClientError(e,"Could not accept Class approval.").message)}
    finally{setBusy(false)}
  }
  return <article className="border border-border bg-card p-5">
    <h3 className="font-serif text-lg">{item.title}</h3>
    <p className="mt-2 text-sm">Approval status: {item.state}</p>
    {eligible&&<>
      <p className="mt-2 text-sm">Approval expires {new Date(item.expiresAt).toLocaleString()}. A seat is not reserved.</p>
      <label className="mt-3 block text-sm font-semibold">Participation mode
        <select value={mode} onChange={e=>setMode(e.target.value as CreditMode)}
          className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm">
          {item.allowedCreditModes.map(m=><option key={m} value={m}>{creditName[m]}</option>)}
        </select>
      </label>
      <p className="mt-3 whitespace-pre-wrap text-sm">{item.consentText}</p>
      <label className="mt-3 flex gap-2 text-sm"><input type="checkbox" checked={adult}
        onChange={e=>setAdult(e.target.checked)}/>I confirm that I am at least 18.</label>
      <label className="mt-3 flex gap-2 text-sm"><input type="checkbox" checked={consent}
        onChange={e=>setConsent(e.target.checked)}/>I accept the current Class participation and data-use terms.</label>
      <Button className="mt-4" disabled={!adult||!consent||busy}
        onClick={()=>void accept()}>{busy?"Accepting…":"Accept approved place"}</Button>
    </>}
    {notice&&<p role="status" className="mt-3 text-sm">{notice}</p>}
    {error&&<p role="alert" className="mt-3 text-sm">{error}</p>}
  </article>;
}
type NativeInvitation=Awaited<ReturnType<typeof getMyNativeClassInvitations>>[number];
function InvitationCard({item,onChanged}:{item:NativeInvitation;onChanged:()=>Promise<void>}){
  const [adult,setAdult]=useState(false);
  const [consent,setConsent]=useState(false);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const pending=item.state==="pending";
  const expires=new Date(item.expiresAt).toLocaleString();
  async function accept(){
    if(!pending||!adult||!consent||busy)return;
    setBusy(true);setError("");setNotice("");
    try{
      await enrollCurrentPersonInClass({data:{
        classOfferingVersionId:item.classOfferingVersionId,
        invitationId:item.invitationId,
        creditMode:item.creditMode,adultAttested:true,consentAccepted:true,
      }});
      setNotice("Invitation accepted. Your Class and learning record are ready.");
      await onChanged();
    }catch(e){
      setError(normalizeClientError(e,"The invitation could not be accepted.").message);
    }finally{setBusy(false);}
  }
  async function decline(){
    if(!pending||busy)return;
    setBusy(true);setError("");setNotice("");
    try{
      await declineNativeClassInvitation({data:{invitationId:item.invitationId}});
      setNotice("Invitation declined. No Enrollment was created.");
      await onChanged();
    }catch(e){
      setError(normalizeClientError(e,"Unable to decline this invitation.").message);
    }finally{setBusy(false);}
  }
  return <article className="border border-border bg-card p-5">
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      Verified native Class invitation · {item.state}
    </p>
    <h3 className="mt-2 font-serif text-xl">{item.title}</h3>
    <p className="mt-2 text-sm text-muted-foreground">
      {pending?"Accept before "+expires:"Invitation expired or already resolved."}
      {" "}An invitation does not reserve a seat or establish enrollment.
    </p>
    {pending&&<>
      <div className="mt-4 border border-border bg-muted/20 p-3">
        <p className="text-sm font-semibold">Published participation and data-use terms</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
          {item.consentText??"Published consent unavailable. Acceptance will be denied."}
        </p>
      </div>
      <label className="mt-4 flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-1" checked={adult}
          onChange={e=>setAdult(e.target.checked)}/>
        I confirm that I am at least 18. Class admission requires a separately verified adult learner identity.
      </label>
      <label className="mt-3 flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-1" checked={consent}
          onChange={e=>setConsent(e.target.checked)}/>
        I accept the current participation and data-use terms.
      </label>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button disabled={!adult||!consent||busy||!item.consentText}
          onClick={()=>void accept()}>{busy?"Processing…":"Accept invitation"}</Button>
        <Button variant="outline" disabled={busy} onClick={()=>void decline()}>
          Decline invitation
        </Button>
      </div>
    </>}
    {notice&&<p role="status" className="mt-3 text-sm">{notice}</p>}
    {error&&<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
  </article>;
}

type EnrolledClass=Awaited<ReturnType<typeof getMyNativeClassEnrollmentHistoryPage>>["items"][number];
function EnrolledClassCard({item,onChanged,destinations}:{item:EnrolledClass;onChanged:()=>Promise<void>;destinations:Item[]}){
  const [confirm,setConfirm]=useState(false);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const [transferVersion,setTransferVersion]=useState("");
  const [transferCredit,setTransferCredit]=useState<"audit"|"not_applicable">("not_applicable");
  const [transferAdult,setTransferAdult]=useState(false);
  const [transferConsent,setTransferConsent]=useState(false);
  const target=destinations.find(row=>row.classOfferingVersionId===transferVersion);
  async function transfer(){
    if(item.status!=="active"||!target||!transferAdult||!transferConsent||
       !target.allowedCreditModes.includes(transferCredit)||busy)return;
    setBusy(true);setNotice("");setError("");
    try{
      await transferMyNativeClassEnrollment({data:{
        sourceClassEnrollmentId:item.classEnrollmentId,
        targetClassOfferingVersionId:target.classOfferingVersionId,
        creditMode:transferCredit,adultAttested:true,consentAccepted:true,
        requestId:crypto.randomUUID(),
      }});
      setNotice("Transfer completed. Old Class history was preserved.");
      setTransferVersion("");setTransferAdult(false);setTransferConsent(false);
      await onChanged();
    }catch(e){setError(normalizeClientError(e,"Class transfer was not completed.").message)}
    finally{setBusy(false)}
  }
  async function withdraw(){
    if(!confirm||busy)return;
    setBusy(true);setError("");setNotice("");
    try{
      await withdrawMyNativeClassEnrollment({data:{classEnrollmentId:item.classEnrollmentId}});
      setNotice("Participation withdrawn. Your learning history is preserved.");
      setConfirm(false);
      await onChanged();
    }catch(e){setError(normalizeClientError(e,"Unable to withdraw from Class.").message);}
    finally{setBusy(false);}
  }
  const current=item.status==="active"||item.status==="pending";
  return <article className="border border-border bg-card p-5">
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <StatusBadge tone={item.status==="active"||item.status==="completed"?"success":item.status==="pending"?"attention":"neutral"}>{item.status.replace("_"," ")}</StatusBadge> · {item.creditMode.replace("_"," ")}
    </p>
    <h3 className="mt-2 font-serif text-xl">{item.title}</h3>
    <p className="mt-2 text-sm text-muted-foreground">{item.deliveryMode.replace("_"," ")}</p>
    {item.courseAttemptId&&["active","completed"].includes(item.status)&&
      <Link to="/class/$classId" params={{classId:item.classId}}
        search={{view:"learn",tab:"lessons"}}
        className="mt-4 inline-block text-sm font-semibold text-primary underline underline-offset-4">
        Open Class
      </Link>}
    {item.status==="active"&&destinations.some(row=>row.classId!==item.classId&&
      row.enrollmentMethods.includes("self"))&&
      <details className="mt-4 border border-border p-3">
        <summary className="cursor-pointer text-sm font-semibold">Transfer to another Class</summary>
        <p className="mt-2 text-sm text-muted-foreground">
          Transfers are only available to public Classes accepting adult self-enrollment.
          The destination seat and current terms are checked again before moving you.
        </p>
        <label className="mt-3 block text-sm font-semibold" htmlFor={"transfer-"+item.classEnrollmentId}>
          Destination Class
        </label>
        <Select id={"transfer-"+item.classEnrollmentId} value={transferVersion}
          onChange={e=>{setTransferVersion(e.target.value);setTransferConsent(false);}}
          className="mt-2">
          <option value="">Select a destination</option>
          {destinations.filter(row=>row.classId!==item.classId&&
            row.enrollmentMethods.includes("self")).map(row=>
            <option key={row.classOfferingVersionId} value={row.classOfferingVersionId}>
              {row.classTitle}
            </option>)}
        </Select>
        {target&&<>
          <label className="mt-3 block text-sm font-semibold">Participation
            <Select value={transferCredit}
              onChange={e=>setTransferCredit(e.target.value as typeof transferCredit)}
              className="mt-2">
              {target.allowedCreditModes.map(m=><option key={m} value={m}>{creditName[m]}</option>)}
            </Select>
          </label>
          <p className="mt-3 whitespace-pre-wrap border border-border bg-muted/20 p-3 text-sm">
            {target.consentText}
          </p>
          <label className="mt-3 flex gap-2 text-sm">
            <Checkbox checked={transferAdult}
              onChange={e=>setTransferAdult(e.target.checked)}/>
            I confirm I am at least 18.
          </label>
          <label className="mt-3 flex gap-2 text-sm">
            <Checkbox checked={transferConsent}
              onChange={e=>setTransferConsent(e.target.checked)}/>
            I accept the destination Class terms and understand my current Class access ends.
          </label>
          <Button size="sm" className="mt-3" disabled={busy||!transferAdult||!transferConsent||
            !target.allowedCreditModes.includes(transferCredit)}
            onClick={()=>void transfer()}>{busy?"Transferring…":"Confirm transfer"}</Button>
        </>}
      </details>}
    {current&&<div className="mt-4">
      {!confirm?<Button type="button" size="sm" variant="outline"
        onClick={()=>setConfirm(true)}>
        {item.status==="pending"?"Cancel request":"Withdraw from Class"}
      </Button>:<div className="border border-border bg-muted/20 p-3">
        <p className="text-sm">This releases your place and ends future Class access.
          Previous results and attendance are retained.</p>
        <div className="mt-3 flex gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={()=>void withdraw()}>
            {busy?"Saving…":"Confirm withdrawal"}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy}
            onClick={()=>setConfirm(false)}>Keep my place</Button>
        </div>
      </div>}
    </div>}
    {notice&&<p role="status" className="mt-3 text-sm">{notice}</p>}
    {error&&<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
  </article>;
}

/** One canonical Class entry. Staff creation and learner discovery share
 * the same route, without a second Class management implementation.
 * All commands remain independently scoped and authorized server-side. */
function ClassHome(){
  const selected=Route.useSearch();
  const mode=selected.view==="manage"?"manage":
    selected.view==="activities"?"activities":"explore";
  const navigation=<NativeClassHomeNavigation mode={mode}
    search={selected.search} classId={selected.classId}
    siteId={selected.siteId} offeringVersionId={selected.offeringVersionId}/>;
  if(selected.view==="activities")return <Suspense fallback={<WorkspaceShell
    title="Course activities" eyebrow="CAN OS" width="wide">
    <p role="status">Opening authorized publisher tools…</p>
  </WorkspaceShell>}>
    <PublisherCourseActivityEditor navigation={navigation}
      preferredCourseVersionId={selected.courseVersionId}/>
  </Suspense>;
  return selected.view==="manage"
    ?<Suspense fallback={<WorkspaceShell title="Classes" eyebrow="CAN OS"
      width="wide"><p role="status">Opening Class management…</p></WorkspaceShell>}>
      <NativeClassManager key={`${selected.siteId??"all"}:${selected.offeringVersionId??"all"}`}
        preferredSiteId={selected.siteId}
        preferredOfferingVersionId={selected.offeringVersionId}
        navigation={navigation}/>
    </Suspense>
    :<NativeLearnerClasses navigation={navigation}/>;
}

function NativeLearnerClasses({navigation}:{navigation:ReactNode}){
  const [recovering,setRecovering]=useState(false);
  const [recoveryNotice,setRecoveryNotice]=useState("");
  const [recoveryError,setRecoveryError]=useState("");

  const client=useQueryClient();
  const requested=Route.useSearch();
  const [searchText,setSearchText]=useState(requested.search??"");
  const [search,setSearch]=useState(requested.search??"");
  const [filteredClassId,setFilteredClassId]=useState(requested.classId??"");
  const siteId=requested.siteId;
  const [deliveryMode,setDeliveryMode]=useState<"all"|"self_paced"|"scheduled"|"facilitated"|"hybrid">("all");
  const catalog=useInfiniteQuery({
    queryKey:["native-public-class-catalog",search,filteredClassId,siteId,deliveryMode],
    initialPageParam:null as {title:string;classId:string}|null,
    queryFn:({pageParam})=>getNativePublicClassCatalogPage({data:{
      search,cursor:pageParam,
      ...(filteredClassId?{classId:filteredClassId}:{}),
      ...(siteId?{siteId}:{}),
      ...(deliveryMode==="all"?{}:{deliveryMode}),
    }}),
    getNextPageParam:last=>last.nextCursor,
    retry:false,
  });
  const catalogItems=catalog.data?.pages.flatMap(page=>page.items)??[];
  const approvals=useQuery({
    queryKey:["native-my-class-approvals"],
    queryFn:()=>getMyNativeClassApprovals(),retry:false,
  });
  const invitations=useQuery({
    queryKey:["native-my-class-invitations"],
    queryFn:()=>getMyNativeClassInvitations(),retry:false,
  });
  const enrolled=useInfiniteQuery({
    queryKey:["native-my-class-enrollment-history"],
    initialPageParam:null as {enrolledAt:string;classEnrollmentId:string}|null,
    queryFn:({pageParam})=>getMyNativeClassEnrollmentHistoryPage({
      data:{cursor:pageParam},
    }),
    getNextPageParam:last=>last.nextCursor,
    retry:false,
  });
  const enrolledItems=enrolled.data?.pages.flatMap(page=>page.items)??[];
  async function refresh(){
    await Promise.all([
      client.invalidateQueries({queryKey:["native-public-class-catalog",search,filteredClassId,siteId,deliveryMode]}),
      client.invalidateQueries({queryKey:["native-my-class-enrollment-history"]}),
      client.invalidateQueries({queryKey:["native-my-class-invitations"]}),
      client.invalidateQueries({queryKey:["native-my-class-approvals"]}),
      // WS1 projects this source independently. Enrollment and withdrawal must
      // invalidate the unified view without writing a second participation row.
      client.invalidateQueries({queryKey:["my-activity"]}),
    ]);
  }
  async function recoverExistingNativeLearning(){
    if(recovering)return;
    setRecovering(true);setRecoveryError("");setRecoveryNotice("");
    try{
      await resumeLinkedNativeClassLearner();
      setRecoveryNotice("Your existing verified CAN learner identity is connected. You can continue without another login.");
      await refresh();
    }catch(error){
      setRecoveryError(normalizeClientError(error,
        "No approved adult learner identity is linked to this CAN account yet. A verified Person, current learner grant and independent identity review may be required before native Class enrollment."
      ).message);
    }finally{setRecovering(false);}
  }
  return <WorkspaceShell width="wide" eyebrow="My CAN" title="My Classes"
    subtitle="One Class enrollment and one learning record, regardless of whether your Class is academic, independent or facilitated."
    actions={<Link to="/learn/my-activity" className="text-sm font-semibold text-primary underline underline-offset-4">My Activity</Link>}>
    {navigation}
    {(enrolled.isError||approvals.isError||invitations.isError)&&
      <section className="mt-5 border border-border bg-card p-5" aria-label="Verified CAN learner session recovery">
        <h2 className="font-serif text-xl">Continue with your CAN account</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          If your CAN account was previously verified and linked to your native learning
          Person, you can restore Class access using this login. This does not enroll
          you in any Class or create a new identity. New learner identities and age
          verification require the governed onboarding process.
        </p>
        <Button className="mt-3" type="button" variant="outline"
          disabled={recovering} onClick={()=>void recoverExistingNativeLearning()}>
          {recovering?"Checking linked identity…":"Restore verified Class access"}
        </Button>
        {recoveryNotice&&<p role="status" className="mt-3 text-sm">{recoveryNotice}</p>}
        {recoveryError&&<p role="alert" className="mt-3 text-sm text-destructive">{recoveryError}</p>}
      </section>}
    <section className="mt-6">
      <h2 className="font-serif text-2xl">My Class invitations</h2>
      {invitations.isPending&&<p role="status" className="mt-3 text-sm">
        Checking invitations for your verified Person…
      </p>}
      {invitations.isError&&<p role="alert" className="mt-3 text-sm">
        Your native Class invitations could not be verified.
      </p>}
      {invitations.isSuccess&&invitations.data.length===0&&
        <p className="mt-3 text-sm text-muted-foreground">No native Class invitations.</p>}
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {invitations.data?.map(item=><InvitationCard key={item.invitationId}
          item={item} onChanged={refresh}/>)} 
      </div>
    </section>
    <section className="mt-6">
      <h2 className="font-serif text-2xl">My Class approvals</h2>
      {approvals.isError&&<p role="alert" className="mt-3 text-sm">Approval history could not be loaded.</p>}
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {approvals.data?.map(item=><ApprovedClassCard key={item.approvalRequestId} item={item} onChanged={refresh}/>)}
      </div>
    </section>
    <section className="mt-6">
      <h2 className="font-serif text-2xl">Enrolled Classes</h2>
      {enrolled.isPending&&<p role="status" className="mt-3 text-sm">Loading your Classes…</p>}
      {enrolled.isError&&<p role="alert" className="mt-3 border border-border p-4 text-sm">Native Class records are unavailable or access could not be verified.</p>}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {enrolledItems.map(item=><EnrolledClassCard
          key={item.classEnrollmentId} item={item} onChanged={refresh} destinations={catalogItems}/>)}
      </div>
      {enrolled.isSuccess&&enrolledItems.length===0&&<p className="mt-4 text-sm text-muted-foreground">You have no native Class enrollments yet.</p>}
      {enrolled.hasNextPage&&<Button type="button" size="sm" variant="outline" className="mt-4"
        disabled={enrolled.isFetchingNextPage}
        onClick={()=>void enrolled.fetchNextPage()}>
        {enrolled.isFetchingNextPage?"Loading history…":"Load older Classes"}
      </Button>}
    </section>
    <section className="mt-8">
      <h2 className="font-serif text-2xl">Explore Classes</h2>
      <p className="mt-2 text-sm text-muted-foreground">Only currently published public Class Offerings are listed. Private and unlisted Classes are not shown.</p>
      {siteId&&<p className="mt-2 text-sm text-muted-foreground">
        Browsing public Classes at the selected Site. Current Site and Offering authority are verified on every page.
      </p>}
      <form className="mt-4 flex flex-wrap gap-2" role="search"
        onSubmit={event=>{event.preventDefault();setFilteredClassId("");setSearch(searchText.trim());}}>
        <label className="sr-only" htmlFor="native-class-catalog-search">Search Classes</label>
        <input id="native-class-catalog-search" type="search" maxLength={100}
          value={searchText} onChange={event=>setSearchText(event.target.value)}
          placeholder="Search by Class name"
          className="min-h-11 min-w-[14rem] flex-1 border border-border bg-background px-3 text-sm"/>
        <label className="sr-only" htmlFor="native-class-delivery-mode">Delivery format</label>
        <select id="native-class-delivery-mode" value={deliveryMode}
          onChange={event=>setDeliveryMode(event.target.value as typeof deliveryMode)}
          className="min-h-11 border border-border bg-background px-3 text-sm">
          <option value="all">All formats</option>
          <option value="self_paced">Self-paced</option>
          <option value="scheduled">Scheduled</option>
          <option value="facilitated">Facilitated</option>
          <option value="hybrid">Hybrid</option>
        </select>
        <Button type="submit">Search Classes</Button>
        {(search||filteredClassId)&&<Button type="button" variant="outline"
          onClick={()=>{setFilteredClassId("");setSearch("");setSearchText("");}}>
          {filteredClassId?"Browse all public Classes":"Clear"}
        </Button>}
      </form>
      {filteredClassId&&<p role="status" className="mt-3 text-sm">
        Showing the specific publicly published Class selected from the Site website.
        Its enrollment terms and current authority are checked again here.
      </p>}
      {catalog.isPending&&<p role="status" className="mt-4 text-sm">Checking currently offered Classes…</p>}
      {catalog.isError&&<p role="alert" className="mt-4 border border-border p-4 text-sm">Public Class discovery is unavailable. Please retry.</p>}
      {catalog.isSuccess&&catalogItems.length===0&&<p className="mt-4 text-sm text-muted-foreground">No public Class Offerings are currently accepting enrollment.</p>}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {catalogItems.map(item=><OfferingCard key={item.classOfferingVersionId} item={item} onJoined={refresh}/>)}
      </div>
      {catalog.hasNextPage&&<Button variant="outline" className="mt-4"
        disabled={catalog.isFetchingNextPage}
        onClick={()=>void catalog.fetchNextPage()}>
        {catalog.isFetchingNextPage?"Loading Classes…":"Load more Classes"}
      </Button>}
      {catalog.isSuccess&&catalogItems.length>0&&!catalog.hasNextPage&&
        <p className="mt-3 text-xs text-muted-foreground">End of matching Classes.</p>}

    </section>
  </WorkspaceShell>;
}

import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery,useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { WorkspaceShell } from "@/components/workspace";
import { useWorkspaceSession } from "@/components/shell/WorkspaceSession";
import {
  enrollMyselfInNoncredit, getOpenNoncreditSelfEnrollmentById,
  getOpenNoncreditSelfEnrollmentPage,
} from "@/modules/enrollment/noncredit-self-enrollment.functions";
import { normalizeClientError } from "@/lib/client-error";
import { noncreditRegistrationRoute } from "@/domain/noncredit-seat-policy";
import { useHydrated } from "@/lib/use-hydrated";
import {getMyNoncreditWaitlist,joinNoncreditWaitlist} from "@/modules/enrollment/noncredit-waitlist.functions";
import {findNoncreditEnrollmentAffiliates} from "@/modules/enrollment/noncredit-affiliate-directory.functions";

export const Route=createFileRoute("/learn/enroll")({
  validateSearch:(search:Record<string,unknown>):{release?:string;ref?:string}=>({
    release:typeof search.release==="string"&&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(search.release)
      ?search.release:undefined,
    ref:typeof search.ref==="string"&&/^[a-zA-Z0-9_-]{1,64}$/.test(search.ref)
      ?search.ref:undefined,
  }),
  component:PublicSelfEnrollment,
});

type Release=Awaited<ReturnType<typeof getOpenNoncreditSelfEnrollmentPage>>["items"][number];

function PublicSelfEnrollment() {
  const router=useRouter();
  const client=useQueryClient();
  const search=Route.useSearch();
  const {session}=useWorkspaceSession();
  const [accepted,setAccepted]=useState(false);
  const [adult,setAdult]=useState(false);
  const [networkMembershipId,setNetworkMembershipId]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [messageError,setMessageError]=useState(false);
  const [enrolled,setEnrolled]=useState<{courseAttemptId:string;alreadyEnrolled:boolean}|null>(null);
  const [waitlisted,setWaitlisted]=useState(false);
  const [searchTerm,setSearchTerm]=useState("");
  const [cursor,setCursor]=useState<string|null>(null);
  const [history,setHistory]=useState<(string|null)[]>([]);
  const term=useDeferredValue(searchTerm.trim());
  const catalog=useQuery({
    queryKey:["noncredit-open-releases",term,cursor],
    queryFn:()=>getOpenNoncreditSelfEnrollmentPage({data:{term,cursor}}),
    retry:false,staleTime:30_000,
  });
  const linkedRelease=useQuery({
    queryKey:["noncredit-open-release",search.release],
    queryFn:()=>getOpenNoncreditSelfEnrollmentById({data:{releaseId:search.release!}}),
    enabled:!!search.release,retry:false,staleTime:30_000,
  });
  const waiting=useQuery({
    queryKey:["my-noncredit-waitlist"],queryFn:()=>getMyNoncreditWaitlist(),
    enabled:session?.authenticated===true&&session.role!=="student",
    retry:false,staleTime:15_000,
  });
  const selected=catalog.data?.items.find(item=>item.id===search.release)??linkedRelease.data??undefined;
  const myWaitlist=waiting.data?.find(entry=>entry.releaseId===selected?.id);
  const invited=myWaitlist?.invitationActive===true;
  const joinQueue=selected?noncreditRegistrationRoute({
    seatsRemaining:selected.seatsRemaining,
    hasWaitingQueue:selected.hasWaitingQueue,
    hasValidInvitation:invited,
  })==="join_waitlist":false;
  const waitlistLoading=session?.authenticated===true&&session.role!=="student"&&waiting.isPending;
  useEffect(()=>{setAccepted(false);setAdult(false);setNetworkMembershipId("");setMessage("");setMessageError(false);setEnrolled(null);setWaitlisted(false);},[search.release]);

  const searchParams=new URLSearchParams();
  if(selected)searchParams.set("release",selected.id);
  if(search.ref)searchParams.set("ref",search.ref);
  const returnTo="/learn/enroll"+(searchParams.size?"?"+searchParams.toString():"");
  async function submit() {
    if(!selected||!accepted||!adult||busy||!session?.authenticated)return;
    setBusy(true);setMessage("");setMessageError(false);
    try{
      if(joinQueue){
        const result=await joinNoncreditWaitlist({data:{
          releaseId:selected.id,consentVersion:selected.consentVersion,
          consentSha256:selected.consentSha256,acceptedConsent:true,adultConfirmed:true,
        }});
        setWaitlisted(result.status!=="invited");
        setMessage(result.status==="invited"?
          "Your invitation is active. Confirm registration to claim the reserved place.":
          "You are on this course's waiting list. Joining does not reserve a seat or charge a fee.");
        await client.invalidateQueries({queryKey:["my-noncredit-waitlist"]});
      }else{
        const result=await enrollMyselfInNoncredit({data:{
          releaseId:selected.id,consentVersion:selected.consentVersion,
          consentSha256:selected.consentSha256,acceptedConsent:true,adultConfirmed:true,
          ...(search.ref?{referralCode:search.ref}:{}),
          ...(networkMembershipId?{networkMembershipId}:{}),
        }});
        setEnrolled(result);
        setMessage(result.alreadyEnrolled?"You are already registered for this course.":
          "Registration confirmed. Your personal learning record has been created.");
        await client.invalidateQueries({queryKey:["my-noncredit-waitlist"]});
      }
    }catch(error){
      setMessageError(true);
      setMessage(normalizeClientError(error,
        "We could not register you. Check the current enrollment availability and your verified account.").message);
    }finally{setBusy(false);}
  }
  return <WorkspaceShell eyebrow="Learning" width="wide" title="Register for learning"
    subtitle="Choose an approved training, confirm your participation, and use your own CAN account. A school application is a separate experience."
    actions={<Link to="/learn/my-courses" className="text-sm font-semibold text-primary underline underline-offset-4">My courses</Link>}>
    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(17rem,.55fr)]">
      <div className="space-y-5">
        <section className="border border-border bg-card p-5">
          <h2 className="font-serif text-2xl">Choose a training</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Only current, provider-approved noncredit releases appear. Courses can be independent or hosted at an authorized community learning location.
          </p>
          <label htmlFor="noncredit-search" className="mt-4 block text-sm font-semibold">
            Search training, provider, or hosting Site
            <input id="noncredit-search" type="search" value={searchTerm} maxLength={100}
              onChange={event=>{setSearchTerm(event.target.value);setCursor(null);setHistory([]);}}
              placeholder="Digital skills, church, city…"
              className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm"/>
          </label>
          {catalog.isPending && <p role="status" className="mt-5 text-sm">Loading published enrollment opportunities…</p>}
          {catalog.isError && <p role="alert" className="mt-5 text-sm">Enrollment availability is temporarily unavailable. <button type="button" onClick={()=>void catalog.refetch()} className="font-semibold text-primary underline">Try again</button></p>}
          {catalog.data && catalog.data.items.length===0 && <p role="status" className="mt-5 border border-border bg-muted/30 p-4 text-sm">
            {catalog.data.nextCursor
              ? "No available training was found in this segment. Select More training to continue browsing approved opportunities."
              : term
                ? "No available training matches this search. Try another program, provider or location."
                : "No noncredit programs are accepting self-registration right now. Providers must publish their courses and enrollment releases before registration can open."}
          </p>}
          {catalog.data && catalog.data.items.length>0 && <div className="mt-4">
            <label className="block text-sm font-semibold" htmlFor="noncredit-release">Published training</label>
            <select id="noncredit-release" value={search.release??""}
              onChange={event=>void router.navigate({to:"/learn/enroll",search:{release:event.target.value||undefined,ref:search.ref}})}
              className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm">
              <option value="">Choose a training</option>
              {catalog.data.items.map(item=><option key={item.id} value={item.id}>
                {item.title} · {item.provider}
              </option>)}
            </select>
            {!selected && <div className="mt-4 grid gap-2">
              {catalog.data.items.map(item=><button type="button" key={item.id}
                onClick={()=>void router.navigate({to:"/learn/enroll",search:{release:item.id,ref:search.ref}})}
                className="border border-border bg-background p-4 text-left focus-visible:outline-2 focus-visible:outline-primary">
                <strong className="block text-sm">{item.title}</strong>
                <span className="mt-2 block text-xs text-muted-foreground">{item.provider} · {item.deliveryMode==="facilitated"?"Facilitated at "+(item.siteName??"approved Site"):"Learn independently"}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{item.seatsRemaining>0?item.seatsRemaining+" seats remaining":"Registration is full"}</span>
              </button>)}
            </div>}
          </div>}
          {catalog.data&&<nav aria-label="Training discovery pages" className="mt-4 flex flex-wrap gap-3">
            <Button type="button" variant="outline" disabled={catalog.isFetching||history.length===0}
              onClick={()=>{
                setCursor(history[history.length-1]??null);
                setHistory(h=>h.slice(0,-1));
              }}>Previous</Button>
            <Button type="button" variant="outline" disabled={catalog.isFetching||!catalog.data.nextCursor}
              onClick={()=>{
                if(!catalog.data?.nextCursor)return;
                setHistory(h=>[...h,cursor]);setCursor(catalog.data.nextCursor);
              }}>More training</Button>
          </nav>}
          {search.release&&linkedRelease.isError&&
            <p role="alert" className="mt-4 text-sm">This specific training could not be checked for current availability.</p>}
        </section>
        {selected && <SelfEnrollmentConfirmation key={selected.id} release={selected}
          signedIn={session?.authenticated===true}
          returnTo={returnTo} accepted={accepted} adult={adult} busy={busy}
          enrolled={enrolled} message={message} messageError={messageError} waitlisted={waitlisted}
          waitlistLoading={waitlistLoading} isStudent={session?.authenticated===true&&session.role==="student"}
          joinQueue={joinQueue} invited={invited} waitlistStatus={myWaitlist?.status??null}
          onAccepted={setAccepted} onAdult={setAdult} onMembershipChange={setNetworkMembershipId}
          onSubmit={()=>void submit()}/>}
      </div>
      <aside className="border border-border bg-card p-5 self-start">
        <h2 className="font-serif text-xl">One learner, one record</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Your verified CAN account can participate in courses across eligible sites and networks.
          Each training creates its own registration, assessment history and completion record.
          Joining a facilitator's room does not create a second registration or count as attendance.
        </p>
        <div className="mt-5 border-t border-border pt-4 text-sm">
          <h3 className="font-semibold">Enrolling a child?</h3>
          <p className="mt-2 leading-6 text-muted-foreground">School and minor registration must follow the appropriate verified guardian and provider workflow, not this adult self-registration form.</p>
          <Link to="/guardian/students" className="mt-3 inline-block font-semibold text-primary underline underline-offset-4">
            Family and student experience
          </Link>
        </div>
      </aside>
    </div>
  </WorkspaceShell>;
}

function SelfEnrollmentConfirmation({release,signedIn,returnTo,accepted,adult,busy,enrolled,message,messageError,waitlisted,waitlistLoading,isStudent,joinQueue,invited,waitlistStatus,onAccepted,onAdult,onMembershipChange,onSubmit}:{
  release:Release;signedIn:boolean;returnTo:string;accepted:boolean;adult:boolean;busy:boolean;
  enrolled:{courseAttemptId:string;alreadyEnrolled:boolean}|null;message:string;messageError:boolean;
  waitlisted:boolean;waitlistLoading:boolean;isStudent:boolean;joinQueue:boolean;invited:boolean;waitlistStatus:string|null;
  onAccepted:(value:boolean)=>void;onAdult:(value:boolean)=>void;
  onMembershipChange:(value:string)=>void;onSubmit:()=>void;
}) {
  const hydrated=useHydrated();
  return <section className="border border-border bg-card p-5" aria-labelledby="enroll-course-heading">
    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Enrollment confirmation</p>
    <h2 id="enroll-course-heading" className="mt-2 font-serif text-2xl">{release.title}</h2>
    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
      <div><dt className="text-xs text-muted-foreground">Provider</dt><dd className="font-medium">{release.provider}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Delivery</dt><dd className="font-medium">{release.deliveryMode==="facilitated"?"Facilitated group · "+(release.siteName??"Site"):"Independent online"}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Instruction</dt><dd className="font-medium">{release.requiredMinutes} minutes</dd></div>
      <div><dt className="text-xs text-muted-foreground">Remaining places</dt><dd className="font-medium">{release.seatsRemaining}</dd></div>
    </dl>
    {release.deliveryMode==="facilitated"&&<section className="mt-5 border-t border-border pt-4" aria-label="Class schedule">
      <h3 className="text-sm font-semibold">Scheduled class meetings</h3>
      <p className="mt-2 text-xs text-muted-foreground">Meeting times are shown in your device\'s timezone. Confirm the onsite schedule with the hosting location.</p>
      {release.sessions.length?
        <ol className="mt-2 space-y-2 text-sm">
          {release.sessions.map((meeting,index)=><li key={index} className="border border-border p-2">
            <time dateTime={meeting.startsAt}>{hydrated?new Date(meeting.startsAt).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short",timeZoneName:"short"}):"Loading local start time…"}</time>
            {" to "}
            <time dateTime={meeting.endsAt}>{hydrated?new Date(meeting.endsAt).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short",timeZoneName:"short"}):"Loading local end time…"}</time>
          </li>)}
        </ol>:
        <p className="mt-2 text-sm text-muted-foreground">No dated meetings have been attached to this cohort. Ask the hosting Site for its schedule before registering.</p>}
      {release.schedulePartial&&<p className="mt-2 text-xs text-muted-foreground">Additional meeting dates are available from the Site.</p>}
    </section>}
    {signedIn&&!isStudent&&<AffiliateAttributionSelector releaseId={release.id} onMembershipChange={onMembershipChange}/>}
    <div className="mt-5 border-t border-border pt-5">
      <h3 className="text-sm font-semibold">Participation and data-use terms · {release.consentVersion}</h3>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{release.consentText}</p>
      <label className="mt-5 flex items-start gap-3 text-sm leading-6">
        <input type="checkbox" checked={accepted} onChange={event=>onAccepted(event.target.checked)}
          className="mt-1 size-4 accent-primary"/>
        I have read and accept the participation and data-use terms for this specific training.
      </label>
      <label className="mt-3 flex items-start gap-3 text-sm leading-6">
        <input type="checkbox" checked={adult} onChange={event=>onAdult(event.target.checked)}
          className="mt-1 size-4 accent-primary"/>
        I confirm I am 18 or older and am registering myself, not another person.
      </label>
    </div>
    {!signedIn && <div className="mt-5 space-y-3 border-t border-border pt-4">
      <p className="text-sm">Verify your CAN account to finish. Your course selection will be preserved after signing in.</p>
      <div className="flex flex-wrap gap-3">
        <Link to="/access" search={{returnTo}} className="inline-flex min-h-11 items-center border border-primary bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          Sign in
        </Link>
        <Link to="/access/register" search={{returnTo}} className="inline-flex min-h-11 items-center border border-border px-4 py-2 text-sm font-semibold">
          Create an adult CAN account
        </Link>
      </div>
    </div>}
    {waitlistStatus&&<p role="status" className="mt-4 text-sm text-muted-foreground">
      Waitlist: {invited?"Reserved invitation, confirm enrollment before it expires":waitlistStatus}.
      <Link to="/learn/my-courses" className="ml-2 text-primary underline">Manage</Link>
    </p>}
    {isStudent&&<p role="status" className="mt-4 text-sm text-muted-foreground">Adult self-registration requires an independently verified adult CAN account. Switch to an eligible account to enroll.</p>}
    {signedIn && !enrolled && !isStudent && <Button type="button" className="mt-5 min-h-11"
      disabled={!accepted||!adult||busy||waitlisted||waitlistLoading||
        (!!waitlistStatus&&joinQueue&&waitlistStatus==="waiting")}
      onClick={onSubmit}>
      {busy?"Saving…":waitlistLoading?"Checking your waitlist…":joinQueue?"Join waiting list":invited?"Claim my reserved place":"Confirm my registration"}
    </Button>}
    {message && <p role={messageError?"alert":"status"} className="mt-4 border border-border bg-muted/20 p-4 text-sm">{message}</p>}
    {enrolled && <div className="mt-4 space-y-2">
      <Link to="/learn/my-courses" className="inline-block font-semibold text-primary underline underline-offset-4">
        Go to my courses
      </Link>
    </div>}
  </section>;
}

/** Affiliation is optional, explicitly self-reported, and distinct from the
 * authorized delivery Site. Never infer it from a favorite or referral link. */
function AffiliateAttributionSelector({releaseId,onMembershipChange}:{
  releaseId:string;onMembershipChange:(value:string)=>void;
}){
  const [term,setTerm]=useState("");
  const [choice,setChoice]=useState("");
  const results=useQuery({
    queryKey:["enrollment-affiliate-directory",releaseId,term.trim()],
    queryFn:()=>findNoncreditEnrollmentAffiliates({data:{releaseId,query:term.trim()}}),
    enabled:term.trim().length>=2,retry:false,staleTime:60_000,
  });
  return <section className="mt-5 border-t border-border pt-4" aria-label="Optional local organization attribution">
    <h3 className="text-sm font-semibold">Representing a local organization? (optional)</h3>
    <p className="mt-2 text-xs leading-5 text-muted-foreground">
      You can credit a participating church or community organization while taking this
      course online. This is your own statement, not proof of individual membership.
      Leave this blank to record your participation at the provider's Site.
    </p>
    <label htmlFor="affiliate-search" className="mt-3 block text-sm font-medium">
      Search approved participating organizations
    </label>
    <input id="affiliate-search" type="search" value={term}
      onChange={event=>{setTerm(event.target.value);setChoice("");onMembershipChange("");}}
      placeholder="Organization or church name" maxLength={80}
      className="mt-1 min-h-11 w-full border border-border bg-background px-3 text-sm"/>
    {results.isError&&term.trim().length>=2&&
      <p className="mt-2 text-xs" role="alert">The affiliate directory is unavailable. You can register without local attribution.</p>}
    {results.data&&<label htmlFor="affiliate-choice" className="mt-3 block text-sm font-medium">
      Select your organization
      <select id="affiliate-choice" value={choice} className="mt-1 min-h-11 w-full border border-border bg-background px-3 text-sm"
        onChange={event=>{setChoice(event.target.value);onMembershipChange(event.target.value);}}>
        <option value="">National / provider Site (no local affiliation)</option>
        {results.data.items.map(item=><option key={item.id} value={item.id}>
          {item.organizationName} · {item.reportingUnitName}
        </option>)}
      </select>
    </label>}
    {results.data?.hasMore&&<p className="mt-2 text-xs text-muted-foreground">
      Refine the organization search to see more matches.
    </p>}
  </section>;
}

import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery,useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/choice";
import { Label } from "@/components/ui/label";
import { WorkspaceShell, MutationFeedback, QueryState, EmptyState, WorkspaceNotice, RecordFacts, EntityCard, StatusBadge } from "@/components/workspace";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { useWorkspaceSession } from "@/components/shell/WorkspaceSession";
import {
  enrollMyselfInNoncredit, getOpenNoncreditSelfEnrollmentById,
  getOpenNoncreditSelfEnrollmentPage,
} from "@/modules/enrollment/noncredit-self-enrollment.functions";
import { noncreditRegistrationRoute } from "@/domain/noncredit-seat-policy";
import { useHydrated } from "@/lib/use-hydrated";
import {getMyNoncreditWaitlistByRelease,joinNoncreditWaitlist} from "@/modules/enrollment/noncredit-waitlist.functions";
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
  const search=Route.useSearch();
  const {session}=useWorkspaceSession();
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
  const selected=catalog.data?.items.find(item=>item.id===search.release)??linkedRelease.data??undefined;
  // Select by exact release rather than scanning a bounded cross-course list.
  // Both the cache and server-side lookup remain scoped to this verified account.
  const waiting=useQuery({
    queryKey:["my-noncredit-waitlist",
      session?.authenticated===true?session.activeGrantId:"signed-out",selected?.id??null],
    queryFn:()=>getMyNoncreditWaitlistByRelease({data:{releaseId:selected!.id}}),
    enabled:!!selected&&session?.authenticated===true&&session.role!=="student",
    retry:false,staleTime:15_000,
  });
  const myWaitlist=waiting.data??undefined;
  const invited=myWaitlist?.invitationActive===true;
  const joinQueue=selected?noncreditRegistrationRoute({
    seatsRemaining:selected.seatsRemaining,
    hasWaitingQueue:selected.hasWaitingQueue,
    hasValidInvitation:invited,
  })==="join_waitlist":false;
  const waitlistLoading=!!selected&&session?.authenticated===true&&session.role!=="student"&&waiting.isPending;
  const waitlistUnavailable=!!selected&&session?.authenticated===true&&session.role!=="student"&&waiting.isError;

  const searchParams=new URLSearchParams();
  if(selected)searchParams.set("release",selected.id);
  if(search.ref)searchParams.set("ref",search.ref);
  const returnTo="/learn/enroll"+(searchParams.size?"?"+searchParams.toString():"");
  return <WorkspaceShell eyebrow="Learning" width="wide" title="Register for learning"
    subtitle="Choose an approved training, confirm your participation, and use your own CAN account. A school application is a separate experience."
    actions={<nav aria-label="Adult learning navigation" className="flex flex-wrap items-center gap-4">
      <Link to="/class" search={{}} className="text-sm font-semibold text-primary underline underline-offset-4">Browse Classes</Link>
      <Link to="/learn/my-activity" className="text-sm font-semibold text-primary underline underline-offset-4">My Activity</Link>
    </nav>}>
    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(17rem,.55fr)]">
      <div className="space-y-5">
        <section className="border border-border bg-card p-5">
          <h2 className="font-serif text-2xl">Choose a training</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Only current, provider-approved noncredit releases appear. Courses can be independent or hosted at an authorized community learning location.
          </p>
          <Label htmlFor="noncredit-search" className="mt-4 block text-sm font-semibold">
            Search training, provider, or hosting Site
            <Input id="noncredit-search" type="search" value={searchTerm} maxLength={100}
              onChange={event=>{setSearchTerm(event.target.value);setCursor(null);setHistory([]);}}
              placeholder="Digital skills, church, city…"
              className="mt-2 min-h-11"/>
          </Label>
          <QueryState
            loading={catalog.isPending?"Loading published enrollment opportunities…":undefined}
            error={catalog.isError?"Enrollment availability is temporarily unavailable.":undefined}
            onRetry={()=>void catalog.refetch()} retrying={catalog.isFetching}/>
          {catalog.data && catalog.data.items.length===0 && <EmptyState kind="matches" className="mt-5"
            title={term?"No matching training":"No training accepting registration"}
            description={catalog.data.nextCursor
              ?"No available training in this segment. Select More training to continue."
              :term?"Try a different program, provider or location."
              :"Providers must publish an approved enrollment release before registration opens."}
            actions={<Link to="/class" search={{}} className="font-semibold text-primary underline underline-offset-4">
              Browse published Classes
            </Link>}/>} 
          {catalog.data && catalog.data.items.length>0 && <div className="mt-4">
            <Label className="block text-sm font-semibold" htmlFor="noncredit-release">Published training</Label>
            <Select id="noncredit-release" value={search.release??""}
              onChange={event=>void router.navigate({to:"/learn/enroll",search:{release:event.target.value||undefined,ref:search.ref}})}
              className="mt-2 min-h-11">
              <option value="">Choose a training</option>
              {catalog.data.items.map(item=><option key={item.id} value={item.id}>
                {item.title} · {item.provider}
              </option>)}
            </Select>
            {!selected && <div className="mt-4 grid gap-2">
              {catalog.data.items.map(item=><EntityCard key={item.id}
                title={item.title}
                subtitle={item.deliveryMode==="facilitated"
                  ?"Facilitated at "+(item.siteName??"approved Site"):"Independent online learning"}
                status={<StatusBadge tone={item.seatsRemaining>0?"success":"attention"}>
                  {item.seatsRemaining>0?item.seatsRemaining+" places open":"Join waiting list"}
                </StatusBadge>}
                meta={item.provider} openLabel="View registration"
                renderLink={({className,children})=><Link to="/learn/enroll"
                  search={{release:item.id,ref:search.ref}} className={className}>
                  {children}
                </Link>}/>)}
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
            <WorkspaceNotice tone="attention" className="mt-4">
              <span>Unable to verify this training's current published terms.</span>
              <Button type="button" size="sm" variant="outline" className="ml-3"
                onClick={()=>void linkedRelease.refetch()}>Retry training lookup</Button>
            </WorkspaceNotice>
        </section>
        {waitlistUnavailable&&<WorkspaceNotice tone="attention">
          <span>Your waiting-list or reserved-invitation status could not be verified. Enrollment is paused to prevent an incorrect request.</span>
          <Button type="button" size="sm" variant="outline" className="ml-3"
            onClick={()=>void waiting.refetch()}>Retry status check</Button>
        </WorkspaceNotice>}
        {selected && <SelfEnrollmentActionForm
          key={selected.id+":"+selected.consentSha256}
          release={selected} signedIn={session?.authenticated===true}
          returnTo={returnTo} referralCode={search.ref}
          waitlistLoading={waitlistLoading} waitlistUnavailable={waitlistUnavailable}
          isStudent={session?.authenticated===true&&session.role==="student"}
          joinQueue={joinQueue} invited={invited} waitlistStatus={myWaitlist?.status??null}/>}
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

/**
 * Registration state is scoped to a specific published release and consent
 * digest. A different Course or updated terms creates a fresh action state,
 * never a stale confirmation or a reusable consent attestation.
 */
function SelfEnrollmentActionForm({release,signedIn,returnTo,referralCode,
  waitlistLoading,waitlistUnavailable,isStudent,joinQueue,invited,waitlistStatus}:{
  release:Release;signedIn:boolean;returnTo:string;referralCode?:string;
  waitlistLoading:boolean;waitlistUnavailable:boolean;isStudent:boolean;joinQueue:boolean;invited:boolean;
  waitlistStatus:string|null;
}) {
  const client=useQueryClient();
  const [accepted,setAccepted]=useState(false);
  const [adult,setAdult]=useState(false);
  const [networkMembershipId,setNetworkMembershipId]=useState("");
  const [enrolled,setEnrolled]=useState<{courseAttemptId:string;alreadyEnrolled:boolean}|null>(null);
  const [waitlisted,setWaitlisted]=useState(false);
  const feedback=useMutationFeedback(async()=>{
    await Promise.all([
      client.invalidateQueries({queryKey:["my-noncredit-waitlist"]},{throwOnError:true}),
      client.invalidateQueries({queryKey:["my-noncredit-self-enrollments"]},{throwOnError:true}),
      client.invalidateQueries({queryKey:["my-activity"]},{throwOnError:true}),
    ]);
  });
  const busy=feedback.pending||feedback.refreshFailed;
  async function submit() {
    if(!signedIn||isStudent||!accepted||!adult||busy||enrolled||waitlisted||
       waitlistLoading||waitlistUnavailable||(joinQueue&&waitlistStatus==="waiting"))return;
    const outcome=await feedback.run(
      async()=>{
        if(joinQueue){
          const result=await joinNoncreditWaitlist({data:{
            releaseId:release.id,consentVersion:release.consentVersion,
            consentSha256:release.consentSha256,acceptedConsent:true,adultConfirmed:true,
          }});
          return {kind:"waitlist" as const,status:result.status};
        }
        const result=await enrollMyselfInNoncredit({data:{
          releaseId:release.id,consentVersion:release.consentVersion,
          consentSha256:release.consentSha256,acceptedConsent:true,adultConfirmed:true,
          ...(referralCode?{referralCode}:{}),
          ...(networkMembershipId?{networkMembershipId}:{}),
        }});
        return {kind:"registration" as const,...result};
      },
      {
        successMessage:result=>result.kind==="waitlist"
          ?result.status==="invited"
            ?"Your invitation is active. Confirm registration to claim the reserved place."
            :"You are on this course's waiting list. Joining does not reserve a seat or charge a fee."
          :result.alreadyEnrolled
            ?"You are already registered for this course."
            :"Registration confirmed. Your personal learning record has been created.",
        commandErrorMessage:"We could not register you. Check the current enrollment availability and your verified account.",
        refreshErrorMessage:"Your enrollment or waitlist decision was saved, but the activity list could not refresh. Retry refresh rather than submitting again.",
      },
    );
    if(outcome.status==="saved"||outcome.status==="refresh-failed"){
      if(outcome.value.kind==="waitlist")
        setWaitlisted(outcome.value.status!=="invited");
      else setEnrolled({
        courseAttemptId:outcome.value.courseAttemptId,
        alreadyEnrolled:outcome.value.alreadyEnrolled,
      });
    }
  }
  return <SelfEnrollmentConfirmation release={release} signedIn={signedIn}
    returnTo={returnTo} accepted={accepted} adult={adult} busy={busy}
    enrolled={enrolled} feedback={feedback} waitlisted={waitlisted}
    waitlistLoading={waitlistLoading} waitlistUnavailable={waitlistUnavailable} isStudent={isStudent}
    joinQueue={joinQueue} invited={invited} waitlistStatus={waitlistStatus}
    onAccepted={setAccepted} onAdult={setAdult} onMembershipChange={setNetworkMembershipId}
    onSubmit={()=>void submit()}/>;
}

function SelfEnrollmentConfirmation({release,signedIn,returnTo,accepted,adult,busy,enrolled,feedback,waitlisted,waitlistLoading,waitlistUnavailable,isStudent,joinQueue,invited,waitlistStatus,onAccepted,onAdult,onMembershipChange,onSubmit}:{
  release:Release;signedIn:boolean;returnTo:string;accepted:boolean;adult:boolean;busy:boolean;
  enrolled:{courseAttemptId:string;alreadyEnrolled:boolean}|null;feedback:ReturnType<typeof useMutationFeedback>;
  waitlisted:boolean;waitlistLoading:boolean;waitlistUnavailable:boolean;isStudent:boolean;joinQueue:boolean;invited:boolean;waitlistStatus:string|null;
  onAccepted:(value:boolean)=>void;onAdult:(value:boolean)=>void;
  onMembershipChange:(value:string)=>void;onSubmit:()=>void;
}) {
  const hydrated=useHydrated();
  return <section className="border border-border bg-card p-5" aria-labelledby="enroll-course-heading">
    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Enrollment confirmation</p>
    <h2 id="enroll-course-heading" className="mt-2 font-serif text-2xl">{release.title}</h2>
    <RecordFacts label="Training enrollment details" className="mt-4" items={[
      {label:"Provider",value:release.provider},
      {label:"Delivery",value:release.deliveryMode==="facilitated"
        ?"Facilitated group · "+(release.siteName??"approved Site"):"Independent online"},
      {label:"Instruction",value:release.requiredMinutes+" minutes"},
      {label:"Unreserved places",value:String(release.seatsRemaining)},
    ]}/>
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
        <WorkspaceNotice tone="attention" className="mt-2">
          No dated meetings have been published for this cohort. Confirm the schedule with the hosting Site before registering.
        </WorkspaceNotice>}
      {release.schedulePartial&&<p className="mt-2 text-xs text-muted-foreground">Additional meeting dates are available from the Site.</p>}
    </section>}
    {signedIn&&!isStudent&&<AffiliateAttributionSelector releaseId={release.id} onMembershipChange={onMembershipChange}/>}
    <div className="mt-5 border-t border-border pt-5">
      <h3 className="text-sm font-semibold">Participation and data-use terms · {release.consentVersion}</h3>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{release.consentText}</p>
      <Label className="mt-5 flex items-start gap-3 text-sm leading-6">
        <Checkbox checked={accepted} onChange={event=>onAccepted(event.target.checked)}
          className="mt-1"/>
        I have read and accept the participation and data-use terms for this specific training.
      </Label>
      <Label className="mt-3 flex items-start gap-3 text-sm leading-6">
        <Checkbox checked={adult} onChange={event=>onAdult(event.target.checked)}
          className="mt-1"/>
        I confirm I am 18 or older and am registering myself, not another person.
      </Label>
    </div>
    {!signedIn && <div className="mt-5 space-y-3 border-t border-border pt-4">
      <p className="text-sm">Verify your CAN account to finish. Your course selection will be preserved after signing in.</p>
      <div className="flex flex-wrap gap-3">
        <Button asChild size="lg"><Link to="/access" search={{returnTo}}>
          Sign in
        </Link></Button>
        <Button asChild size="lg" variant="outline"><Link to="/access/register" search={{returnTo}}>
          Create an adult CAN account
        </Link></Button>
      </div>
    </div>}
    {waitlistStatus&&<p role="status" className="mt-4 text-sm text-muted-foreground">
      Waitlist: {invited?"Reserved invitation, confirm enrollment before it expires":waitlistStatus}.
      <Link to="/learn/my-activity" className="ml-2 text-primary underline">Manage</Link>
    </p>}
    {isStudent&&<p role="status" className="mt-4 text-sm text-muted-foreground">Adult self-registration requires an independently verified adult CAN account. Switch to an eligible account to enroll.</p>}
    {signedIn && !enrolled && !isStudent && <Button type="button" className="mt-5 min-h-11"
      disabled={!accepted||!adult||busy||waitlisted||waitlistLoading||waitlistUnavailable||
        (!!waitlistStatus&&joinQueue&&waitlistStatus==="waiting")}
      onClick={onSubmit}>
      {busy?"Saving…":waitlistLoading?"Checking your waitlist…":joinQueue?"Join waiting list":invited?"Claim my reserved place":"Confirm my registration"}
    </Button>}
    <MutationFeedback state={feedback} pendingMessage="Saving enrollment decision…" className="mt-4"/>
    {enrolled && <nav aria-label="After enrollment" className="mt-4 flex flex-wrap items-center gap-4 text-sm">
      <Button asChild size="lg"><Link to="/learn/course/$courseAttemptId"
        params={{courseAttemptId:enrolled.courseAttemptId}}>Start learning</Link></Button>
      <Link to="/learn/my-activity" className="font-semibold text-primary underline underline-offset-4">
        View My Activity
      </Link>
    </nav>
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
      Leave this blank to credit the provider by default; a location is not inferred.
    </p>
    <Label htmlFor="affiliate-search" className="mt-3 block text-sm font-medium">
      Search approved participating organizations
    </Label>
    <Input id="affiliate-search" type="search" value={term}
      onChange={event=>{setTerm(event.target.value);setChoice("");onMembershipChange("");}}
      placeholder="Organization or church name" maxLength={80}
      className="mt-1 min-h-11"/>
    {results.isError&&term.trim().length>=2&&
      <p className="mt-2 text-xs" role="alert">The affiliate directory is unavailable. You can register without local attribution.</p>}
    {results.data&&<Label htmlFor="affiliate-choice" className="mt-3 block text-sm font-medium">
      Select your organization
      <Select id="affiliate-choice" value={choice} className="mt-1 min-h-11"
        onChange={event=>{setChoice(event.target.value);onMembershipChange(event.target.value);}}>
        <option value="">National / provider Site (no local affiliation)</option>
        {results.data.items.map(item=><option key={item.id} value={item.id}>
          {item.organizationName} · {item.reportingUnitName}
        </option>)}
      </Select>
    </Label>}
    {results.data?.hasMore&&<p className="mt-2 text-xs text-muted-foreground">
      Refine the organization search to see more matches.
    </p>}
  </section>;
}

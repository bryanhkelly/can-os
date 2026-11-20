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
import { getAvailableClassesForCourseRegistration } from "@/modules/enrollment/course-class-selection.functions";
import { noncreditWaitlistQueryKeys } from "@/domain/noncredit-waitlist-query-keys";
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
type CourseClassChoice=Awaited<ReturnType<typeof getAvailableClassesForCourseRegistration>>[number];

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
  // The exact approved release read is authoritative for selection, consent
  // and remaining capacity. A cached discovery page is only a navigation list.
  const selected=search.release&&linkedRelease.isSuccess?linkedRelease.data??undefined:undefined;
  // Select by exact release rather than scanning a bounded cross-course list.
  // Both the cache and server-side lookup remain scoped to this verified account.
  const waiting=useQuery({
    queryKey:noncreditWaitlistQueryKeys.detail(
      session?.authenticated===true?session.activeGrantId:"signed-out",
      selected?.id??null,
    ),
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
          {catalog.data && catalog.data.items.length===0 && !selected && <EmptyState kind="matches" className="mt-5"
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
              {selected&&!catalog.data.items.some(item=>item.id===selected.id)&&
                <option value={selected.id}>{selected.title} · {selected.provider}</option>}
            </Select>
            {!selected && <div className="mt-4 grid gap-2">
              {catalog.data.items.map(item=><EntityCard key={item.id}
                title={item.title}
                subtitle={item.deliveryMode==="facilitated"
                  ?"Facilitated at "+(item.siteName??"approved Site"):"Independent online learning"}
                status={<StatusBadge tone={item.seatsRemaining>0?"success":"attention"}>
                  {item.seatsRemaining>0?item.seatsRemaining+" places open":"No unreserved places"}
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
          {search.release&&linkedRelease.isPending&&
            <QueryState loading="Checking this training's current approval, seats and terms…"/>}
          {search.release&&linkedRelease.isSuccess&&!linkedRelease.data&&
            <WorkspaceNotice tone="attention" className="mt-4">
              <span>This training is no longer available for self-registration. Choose another published training.</span>
              <Button type="button" variant="outline" size="sm" className="ml-3"
                onClick={()=>void router.navigate({to:"/learn/enroll",search:{release:undefined,ref:search.ref}})}>
                Browse available training
              </Button>
            </WorkspaceNotice>}
          {search.release&&linkedRelease.isError&&
            <WorkspaceNotice tone="attention" className="mt-4">
              <span>Unable to verify this training's current published terms.</span>
              <Button type="button" size="sm" variant="outline" className="ml-3"
                onClick={()=>void linkedRelease.refetch()}>Retry training lookup</Button>
            </WorkspaceNotice>}
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
  const [selectedClassId,setSelectedClassId]=useState("");
  const availableClasses=useQuery({
    queryKey:["available-course-classes",release.id],
    queryFn:()=>getAvailableClassesForCourseRegistration({data:{releaseId:release.id}}),
    retry:false,staleTime:15_000,
  });
  const openClasses=availableClasses.data?.filter(item=>
    item.seatsRemaining===null||item.seatsRemaining>0)??[];
  const classId=selectedClassId||(openClasses.length===1?openClasses[0]!.id:"");
  const chosenClass=openClasses.find(item=>item.id===classId)??null;
  const [enrolled,setEnrolled]=useState<{courseAttemptId:string;alreadyEnrolled:boolean;classId:string|null}|null>(null);
  const [waitlisted,setWaitlisted]=useState(false);
  const feedback=useMutationFeedback(async()=>{
    await Promise.all([
      client.invalidateQueries({queryKey:["my-noncredit-waitlist"]},{throwOnError:true}),
      client.invalidateQueries({queryKey:["my-noncredit-self-enrollments"]},{throwOnError:true}),
      client.invalidateQueries({queryKey:["my-activity"]},{throwOnError:true}),
      // Seat counts and published-release status are advisory public reads.
      // Refresh them after a saved decision without treating a failed catalog
      // reload as a failed enrollment or a reason to resubmit the command.
      client.invalidateQueries({queryKey:["noncredit-open-releases"]}),
      client.invalidateQueries({queryKey:["noncredit-open-release"]}),
    ]);
  });
  const busy=feedback.pending||feedback.refreshFailed;
  async function submit() {
    if(!signedIn||isStudent||!accepted||!adult||busy||enrolled||waitlisted||
       waitlistLoading||waitlistUnavailable||(joinQueue&&waitlistStatus==="waiting")||
       (!joinQueue&&(!availableClasses.data||!chosenClass)))return;
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
          ...(classId?{classId}:{}),
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
            :"Course registration confirmed and Class placement saved. Your learning record is ready.",
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
        classId:outcome.value.classId,
      });
    }
  }
  return <SelfEnrollmentConfirmation release={release} signedIn={signedIn}
    returnTo={returnTo} accepted={accepted} adult={adult} busy={busy}
    enrolled={enrolled} feedback={feedback} waitlisted={waitlisted}
    waitlistLoading={waitlistLoading} waitlistUnavailable={waitlistUnavailable} isStudent={isStudent}
    joinQueue={joinQueue} invited={invited} waitlistStatus={waitlistStatus}
    classChoices={availableClasses.data??[]} classChoiceLoading={availableClasses.isPending}
    classChoiceError={availableClasses.isError} classId={classId} onClassChange={setSelectedClassId}
    onAccepted={setAccepted} onAdult={setAdult} onMembershipChange={setNetworkMembershipId}
    onSubmit={()=>void submit()}/>;
}

function SelfEnrollmentConfirmation({release,signedIn,returnTo,accepted,adult,busy,enrolled,feedback,waitlisted,waitlistLoading,waitlistUnavailable,isStudent,joinQueue,invited,waitlistStatus,classChoices,classChoiceLoading,classChoiceError,classId,onClassChange,onAccepted,onAdult,onMembershipChange,onSubmit}:{
  release:Release;signedIn:boolean;returnTo:string;accepted:boolean;adult:boolean;busy:boolean;
  enrolled:{courseAttemptId:string;alreadyEnrolled:boolean;classId:string|null}|null;feedback:ReturnType<typeof useMutationFeedback>;
  waitlisted:boolean;waitlistLoading:boolean;waitlistUnavailable:boolean;isStudent:boolean;joinQueue:boolean;invited:boolean;waitlistStatus:string|null;
  classChoices:CourseClassChoice[];classChoiceLoading:boolean;classChoiceError:boolean;
  classId:string;onClassChange:(id:string)=>void;
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
    {!joinQueue&&<section className="mt-5 border-t border-border pt-4" aria-label="Choose your Class">
      <h3 className="text-sm font-semibold">Choose your Class</h3>
      <p className="mt-2 text-xs text-muted-foreground">
        Joining a Class requires an independently verified adult learning identity.
        Confirming your age below is also required but does not replace verification.
      </p>
      {classChoiceLoading&&<QueryState loading="Checking authorized Classes and Sessions…"/>}
      {classChoiceError&&<WorkspaceNotice tone="attention" className="mt-2">
        Class availability could not be verified. Registration is temporarily unavailable.
      </WorkspaceNotice>}
      {!classChoiceLoading&&!classChoiceError&&classChoices.length===0&&
        <WorkspaceNotice tone="attention" className="mt-2">
          This Course does not yet have a ready Class at the selected Site. The Site must prepare and authorize a Class before registration opens.
        </WorkspaceNotice>}
      {classChoices.length>0&&<Label htmlFor="course-class-choice" className="mt-3 block text-sm font-medium">
        Class
        <Select id="course-class-choice" value={classId}
          onChange={event=>onClassChange(event.target.value)}
          className="mt-2 min-h-11">
          <option value="">Choose an available Class</option>
          {classChoices.map(item=><option key={item.id} value={item.id}
            disabled={item.seatsRemaining!==null&&item.seatsRemaining<=0}>
            {item.title}{item.seatsRemaining===0?" · Full":""}
          </option>)}
        </Select>
      </Label>}
      {classChoices.filter(item=>item.id===classId).map(item=><div key={item.id} className="mt-4">
        <p className="text-sm text-muted-foreground">{item.deliveryMode==="self_paced"
          ?"Self-paced Class: begin learning after registration."
          :item.sessions.length+" scheduled Session"+(item.sessions.length===1?"":"s")+"."}</p>
        {item.sessions.length>0&&<ol className="mt-3 space-y-2 text-sm" aria-label="Class Sessions">
          {item.sessions.map((session,index)=><li key={session.startsAt+index}
            className="border border-border p-2">
            <time dateTime={session.startsAt}>{hydrated
              ?new Date(session.startsAt).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short",timeZoneName:"short"})
              :"Loading Session time…"}</time>
            {" to "}
            <time dateTime={session.endsAt}>{hydrated
              ?new Date(session.endsAt).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short",timeZoneName:"short"})
              :"Loading Session end time…"}</time>
          </li>)}
        </ol>}
      </div>)}
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
        (!!waitlistStatus&&joinQueue&&waitlistStatus==="waiting")||
        (!joinQueue&&(classChoiceLoading||classChoiceError||!classId))}
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
    </nav>}
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

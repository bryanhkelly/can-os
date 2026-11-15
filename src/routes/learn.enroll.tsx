import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { WorkspaceShell } from "@/components/workspace";
import { useWorkspaceSession } from "@/components/shell/WorkspaceSession";
import {
  enrollMyselfInNoncredit, getOpenNoncreditSelfEnrollment,
} from "@/modules/enrollment/noncredit-self-enrollment.functions";
import { normalizeClientError } from "@/lib/client-error";

export const Route=createFileRoute("/learn/enroll")({
  validateSearch:(search:Record<string,unknown>)=>({
    release:typeof search.release==="string"&&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(search.release)
      ?search.release:undefined,
    ref:typeof search.ref==="string"&&/^[a-zA-Z0-9_-]{1,64}$/.test(search.ref)
      ?search.ref:undefined,
  }),
  component:PublicSelfEnrollment,
});

type Release=Awaited<ReturnType<typeof getOpenNoncreditSelfEnrollment>>[number];

function PublicSelfEnrollment() {
  const router=useRouter();
  const search=Route.useSearch();
  const {session}=useWorkspaceSession();
  const [accepted,setAccepted]=useState(false);
  const [adult,setAdult]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [enrolled,setEnrolled]=useState<{courseAttemptId:string;alreadyEnrolled:boolean}|null>(null);
  const catalog=useQuery({
    queryKey:["noncredit-open-releases"],
    queryFn:()=>getOpenNoncreditSelfEnrollment(),retry:false,staleTime:30_000,
  });
  const selected=catalog.data?.find(item=>item.id===search.release);
  useEffect(()=>{setAccepted(false);setAdult(false);setMessage("");setEnrolled(null);},[search.release]);

  const searchParams=new URLSearchParams();
  if(selected)searchParams.set("release",selected.id);
  if(search.ref)searchParams.set("ref",search.ref);
  const returnTo="/learn/enroll"+(searchParams.size?"?"+searchParams.toString():"");
  async function submit() {
    if(!selected||!accepted||!adult||busy||!session?.authenticated)return;
    setBusy(true);setMessage("");
    try{
      const result=await enrollMyselfInNoncredit({data:{
        releaseId:selected.id,consentVersion:selected.consentVersion,
        consentSha256:selected.consentSha256,acceptedConsent:true,adultConfirmed:true,
        ...(search.ref?{referralCode:search.ref}:{}),
      }});
      setEnrolled(result);
      setMessage(result.alreadyEnrolled?"You are already registered for this course.":
        "Registration confirmed. Your personal learning record has been created.");
    }catch(error){
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
          {catalog.isPending && <p role="status" className="mt-5 text-sm">Loading published enrollment opportunities…</p>}
          {catalog.isError && <p role="alert" className="mt-5 text-sm">Enrollment availability is temporarily unavailable. <button type="button" onClick={()=>void catalog.refetch()} className="font-semibold text-primary underline">Try again</button></p>}
          {catalog.data && catalog.data.length===0 && <p role="status" className="mt-5 border border-border bg-muted/30 p-4 text-sm">
            No noncredit programs are accepting self-registration right now. Your CAN account is still available, and the provider must publish its course and enrollment release before registration can open.
          </p>}
          {catalog.data && catalog.data.length>0 && <div className="mt-4">
            <label className="block text-sm font-semibold" htmlFor="noncredit-release">Published training</label>
            <select id="noncredit-release" value={search.release??""}
              onChange={event=>void router.navigate({to:"/learn/enroll",search:{release:event.target.value||undefined,ref:search.ref}})}
              className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm">
              <option value="">Choose a training</option>
              {catalog.data.map(item=><option key={item.id} value={item.id}>
                {item.title} · {item.provider}
              </option>)}
            </select>
            {!selected && <div className="mt-4 grid gap-2">
              {catalog.data.map(item=><button type="button" key={item.id}
                onClick={()=>void router.navigate({to:"/learn/enroll",search:{release:item.id,ref:search.ref}})}
                className="border border-border bg-background p-4 text-left focus-visible:outline-2 focus-visible:outline-primary">
                <strong className="block text-sm">{item.title}</strong>
                <span className="mt-2 block text-xs text-muted-foreground">{item.provider} · {item.deliveryMode==="facilitated"?"Facilitated at "+(item.siteName??"approved Site"):"Learn independently"}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{item.seatsRemaining>0?item.seatsRemaining+" seats remaining":"Registration is full"}</span>
              </button>)}
            </div>}
          </div>}
        </section>
        {selected && <SelfEnrollmentConfirmation key={selected.id} release={selected}
          signedIn={session?.authenticated===true}
          returnTo={returnTo} accepted={accepted} adult={adult} busy={busy}
          enrolled={enrolled} message={message}
          onAccepted={setAccepted} onAdult={setAdult} onSubmit={()=>void submit()}/>}
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

function SelfEnrollmentConfirmation({release,signedIn,returnTo,accepted,adult,busy,enrolled,message,onAccepted,onAdult,onSubmit}:{
  release:Release;signedIn:boolean;returnTo:string;accepted:boolean;adult:boolean;busy:boolean;
  enrolled:{courseAttemptId:string;alreadyEnrolled:boolean}|null;message:string;
  onAccepted:(value:boolean)=>void;onAdult:(value:boolean)=>void;onSubmit:()=>void;
}) {
  return <section className="border border-border bg-card p-5" aria-labelledby="enroll-course-heading">
    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Enrollment confirmation</p>
    <h2 id="enroll-course-heading" className="mt-2 font-serif text-2xl">{release.title}</h2>
    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
      <div><dt className="text-xs text-muted-foreground">Provider</dt><dd className="font-medium">{release.provider}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Delivery</dt><dd className="font-medium">{release.deliveryMode==="facilitated"?"Facilitated group · "+(release.siteName??"Site"):"Independent online"}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Instruction</dt><dd className="font-medium">{release.requiredMinutes} minutes</dd></div>
      <div><dt className="text-xs text-muted-foreground">Remaining places</dt><dd className="font-medium">{release.seatsRemaining}</dd></div>
    </dl>
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
    {signedIn && !enrolled && <Button type="button" className="mt-5 min-h-11"
      disabled={!accepted||!adult||busy||release.seatsRemaining<=0}
      onClick={onSubmit}>{busy?"Registering…":"Confirm my registration"}</Button>}
    {message && <p role={enrolled?"status":"alert"} className="mt-4 border border-border bg-muted/20 p-4 text-sm">{message}</p>}
    {enrolled && <div className="mt-4 space-y-2">
      <Link to="/learn/my-courses" className="inline-block font-semibold text-primary underline underline-offset-4">
        Go to my courses
      </Link>
    </div>}
  </section>;
}

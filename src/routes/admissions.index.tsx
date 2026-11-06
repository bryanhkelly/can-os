import { mutationErrorMessage, useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { ArrowLeft } from "lucide-react";
import { listEnrollmentPlacements, placeEnrolledStudent } from "@/modules/enrollment/course-placement.functions";
import {StudentLearningAccessHandoff} from "@/components/enrollment/StudentLearningAccessHandoff";
import {FirstSchoolDayHandoff} from "@/components/enrollment/FirstSchoolDayHandoff";
import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { getActiveEnrollmentCounts, getAdmissionsDashboard } from "@/modules/enrollment/admissions-dashboard.functions";
import { listMySites } from "@/modules/operations/site-directory.functions";
import { listAdmissionsPrograms } from "@/modules/enrollment/admissions-program-directory.functions";
import { getAdmissionOfferOptions, issueAdmissionOffer, activateOfferedEnrollment,withdrawIssuedAdmissionOffer } from "@/modules/enrollment/admissions-offer.functions";
import { pipelineStages, type AdmissionsStage } from "@/domain/admissions-pipeline";
import { selectActionableOffer, canIssueAnotherOffer } from "@/domain/admissions-offer-selection";
import { WorkspaceShell, StatCard, EmptyState, DetailNavigation, SectionTab, StatusBadge, CreateAction, secondaryActionClassName } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import {z} from "zod";
import {optionalSearchUuid,siteProgramHref,siteProgramSelectionSchema} from "@/lib/route-search";
import { PageNavigation } from "@/components/workspace/page-navigation";
import { SiteProgramFields } from "@/components/workspace/site-program-fields";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { plural } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

const admissionsSearchSchema=siteProgramSelectionSchema.extend({
 application:optionalSearchUuid,
 stage:z.unknown().transform(value=>pipelineStages.find(stage=>stage===value)),
 page:z.unknown().transform(value=>
  typeof value==="number"&&Number.isInteger(value)&&value>0
   ?Math.min(value,10_000)
   :typeof value==="string"&&/^\d+$/.test(value)&&Number(value)>0
    ?Math.min(Number(value),10_000):undefined),
});

const formatStatus=(status:string)=>status.replaceAll("_"," ").replace(/\b\w/g,letter=>letter.toUpperCase());

const loadAdmissions = async (selection:{
 siteId?:string;programId?:string;application?:string;stage?:AdmissionsStage;page?:number;
}={}) => {
 const [dashboard,options,enrollmentCounts,sites,programs]=await Promise.all([
  getAdmissionsDashboard({data:{
   siteId:selection.siteId,programId:selection.programId,applicationId:selection.application,
   stage:selection.stage,page:selection.page,
  }}),
  selection.application
   ?getAdmissionOfferOptions({data:{
    siteId:selection.siteId,programId:selection.programId,applicationId:selection.application,
   }})
   :Promise.resolve([]),
  getActiveEnrollmentCounts({data:{siteId:selection.siteId,programId:selection.programId}}),
  listMySites(),
  listAdmissionsPrograms(),
 ]);
 return {...dashboard,options,enrollmentCounts,sites,programs};
};

export const Route = createFileRoute("/admissions/")({
  validateSearch:(search:Record<string,unknown>):{siteId?:string;programId?:string;application?:string;stage?:AdmissionsStage;page?:number}=>admissionsSearchSchema.parse(search),
  loaderDeps:({search})=>({
   siteId:search.siteId,programId:search.programId,application:search.application,
   stage:search.stage,page:search.page,
  }),
  loader:({deps})=>safeLoader(()=>loadAdmissions(deps),{
    authMessage:"Sign in with an authorized registrar account to view the admissions command center.",
  })(),
  component: Admissions,
});

function Admissions() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) return <LoaderFailure eyebrow="Admissions" title="Admissions command center" outcome={outcome} />;
  return <AdmissionsView data={outcome.data} />;
}

function AdmissionsView({ data }: { data: Awaited<ReturnType<typeof loadAdmissions>> }) {
  const { rows, detail, summary, page, pageSize, filteredTotal, hasMore, options, enrollmentCounts, sites, programs } = data;
  const selected=Route.useSearch();
  const pageCount=Math.max(1,Math.ceil(filteredTotal/pageSize));
  const activeEnrollmentCount=enrollmentCounts.reduce((total,row)=>total+row.activeStudents,0);
  const openScope=(siteId?:string,programId?:string)=>{
    void router.navigate({href:siteProgramHref("/admissions",{siteId,programId})});
  };
  const router = useRouter();
  const mutation = useMutationFeedback(() => router.invalidate());
  const [interactive,setInteractive]=useState(false);
  useEffect(()=>setInteractive(true),[]);
  const busy=!interactive||mutation.pending||mutation.refreshFailed;
  const selectedHeading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{ if(selected.application) selectedHeading.current?.focus(); },[selected.application]);
  const listSearch={siteId:selected.siteId,programId:selected.programId,stage:selected.stage,page:selected.page&&selected.page>1?selected.page:undefined};

  async function transact(fn: () => Promise<unknown>) {
    await mutation.run(fn, {
      successMessage: "Saved to enrollment records.",
      commandErrorMessage: "Admissions transaction failed",
    });
  }

  return (
    <WorkspaceShell
      width="wide"
      eyebrow="Admissions"
      title="Admissions command center"
      subtitle="Registrar workspace: issue offers and activate accepted enrollments. Guardians respond from their own authenticated offer inbox."
      actions={<div className="flex flex-wrap items-center gap-2">
        <CreateAction><Link to="/admissions/intake" search={{siteId:selected.siteId,programId:selected.programId}}>New inquiry</Link></CreateAction>
        <Link to="/admissions/invite-families" className={secondaryActionClassName}>Invite transfer families</Link>
        <Link to="/admissions/transcripts" search={{query:""}} className={secondaryActionClassName}>Official transcripts</Link>
        <Link to="/admissions/capacity" search={{siteId:selected.siteId,programId:selected.programId}} className={secondaryActionClassName}>Program capacity</Link>
      </div>}
    >
      <MutationFeedback state={mutation} pendingMessage="Saving enrollment records..." className="mt-4"/>
      {!selected.application&&<>
      <div className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
        <SiteProgramFields sites={sites} programs={programs} siteId={selected.siteId??""} programId={selected.programId??""}
          labelPrefix="Admissions" sitePlaceholder="All permitted schools" programPlaceholder="All permitted programs"
          onChange={(siteId,programId)=>openScope(siteId||undefined,programId||undefined)}/>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Applications" value={summary.total} />
        <StatCard label="Awaiting decision" value={summary.awaitingDecision} />
        <StatCard label="Blocking requirements" value={summary.missingRequirements} />
      </div>
      <div className="mt-3 rounded-xl border p-4"><p className="text-sm">Active students across programs: <strong>{activeEnrollmentCount}</strong></p></div>
      <h2 className="mt-9 font-serif text-2xl">Pipeline</h2>
      <DetailNavigation label="Admissions stages">
       <SectionTab current={!selected.stage} link={{to:"/admissions",search:{siteId:selected.siteId,programId:selected.programId}}}>All ({summary.total})</SectionTab>
       {summary.byStage.map(item=><SectionTab key={item.stage} current={selected.stage===item.stage} className="capitalize"
        link={{to:"/admissions",search:{siteId:selected.siteId,programId:selected.programId,stage:item.stage}}}>{item.stage} ({item.count})</SectionTab>)}
      </DetailNavigation>
      {!selected.application&&<div className="rounded-xl border bg-card">
       <ul aria-label="Applications" className="divide-y sm:hidden">{rows.map(row=>{
        const href={siteId:selected.siteId,programId:selected.programId,stage:selected.stage,page:page>1?page:undefined,application:row.id};
        return <li key={row.id} className="space-y-2 p-4">
         <div className="flex items-start justify-between gap-3">
          <Link to="/admissions" search={href} className="font-semibold underline">{row.studentName??row.id}</Link>
          <StatusBadge tone={row.enrollments.length>0?"success":row.outstandingRequirements>0?"attention":"neutral"}>{row.enrollments.length>0?"Enrolled":formatStatus(row.disposition==="waitlisted"?"waitlisted":row.stage)}</StatusBadge>
         </div>
         <p className="text-sm text-muted-foreground">{row.program}</p>
         <Link to="/admissions" search={href} className="inline-flex min-h-11 items-center text-sm font-semibold underline">{nextStep(row)}</Link>
        </li>;
       })}</ul>
       <Table className="hidden text-left sm:table">
        <caption className="sr-only">Authorized admissions pipeline and next steps</caption>
        <TableHeader className="bg-muted/50"><TableRow><TableHead scope="col" className="p-4">Applicant</TableHead><TableHead scope="col" className="p-4">Program</TableHead><TableHead scope="col" className="p-4">Stage</TableHead><TableHead scope="col" className="p-4">Next step</TableHead></TableRow></TableHeader>
        <TableBody className="divide-y">{rows.map(row=>{
         const next=nextStep(row);
         return <TableRow key={row.id} className="align-top hover:bg-muted/40">
          <th scope="row" className="p-4 font-semibold"><Link to="/admissions" search={{siteId:selected.siteId,programId:selected.programId,stage:selected.stage,page:page>1?page:undefined,application:row.id}} className="underline">{row.studentName??row.id}</Link><span className="mt-1 block text-xs font-normal text-muted-foreground">{row.submittedAt?`Submitted ${new Date(row.submittedAt).toLocaleDateString()}`:"Not submitted"}</span></th>
          <TableCell className="p-4 align-top">{row.program}</TableCell><TableCell className="p-4 align-top"><StatusBadge tone={row.enrollments.length>0?"success":row.outstandingRequirements>0?"attention":"neutral"}>{row.enrollments.length>0?"Enrolled":formatStatus(row.disposition==="waitlisted"?"waitlisted":row.stage)}</StatusBadge></TableCell>
          <TableCell className="p-4 align-top"><Link to="/admissions" search={{siteId:selected.siteId,programId:selected.programId,stage:selected.stage,page:page>1?page:undefined,application:row.id}} className="underline">{next}</Link></TableCell>
         </TableRow>;
        })}</TableBody>
       </Table>
       {!rows.length&&<p className="p-5 text-sm text-muted-foreground">No applications in this stage and scope.</p>}
      </div>}
      {!selected.application&&pageCount>1&&<PageNavigation label="Admissions pages" className="mt-4 justify-between" showUnavailable
       previous={page>1&&<Link to="/admissions" search={{siteId:selected.siteId,programId:selected.programId,stage:selected.stage,page:page-1}} className="rounded border px-3 py-2">Previous page</Link>}
       next={hasMore&&<Link to="/admissions" search={{siteId:selected.siteId,programId:selected.programId,stage:selected.stage,page:page+1}} className="rounded border px-3 py-2">Next page</Link>}>
       <span>Page {page} of {pageCount} · {filteredTotal} applications</span>
      </PageNavigation>}
      </>}
      {selected.application&&<Link to="/admissions" search={listSearch} className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-semibold underline"><ArrowLeft className="size-4" aria-hidden="true" />All applications</Link>}
      {selected.application&&!detail&&<p role="alert" className="mt-4 rounded-xl border p-4">This application is unavailable in the current admissions view.</p>}
      <div className="mt-4 space-y-3">{detail&&[detail].map(x => {
        const years = options.find(o => o.applicationId === x.id)?.years ?? [];
        // Program enrollment is authoritative even when its original offer is
        // expired, withdrawn or no longer the first currently actionable offer.
        const activated = x.enrollments.length > 0;
        const enrolledOffer = x.offers.find(offer =>
          x.enrollments.some(enrollment => enrollment.schoolYearId === offer.schoolYearId));
        const latest = enrolledOffer ?? selectActionableOffer(x.offers);
        return <article key={x.id} aria-labelledby="selected-application" className="rounded-xl border p-4">
          <h2 id="selected-application" ref={selectedHeading} tabIndex={-1} className="mb-2 font-serif text-2xl outline-none">{x.studentName??x.id}</h2>
          <p className="font-semibold"><Link to="/admissions/families" search={{siteId:selected.siteId,programId:x.programId,application:x.id}} className="hover:underline">{x.program}</Link></p>
          <p className="mt-1 text-sm text-muted-foreground">{formatStatus(x.stage)} · {x.outstandingRequirements} outstanding blocking requirements</p>
          <section aria-label="Next enrollment action" className="mt-4 rounded-xl border border-primary/30 bg-muted/30 p-4">
           <p className="text-xs font-bold uppercase tracking-widest text-primary">Next action</p>
           {activated ? <>
            <p className="mt-2 font-semibold">{x.activeSectionCount===0?"Place this student in a staffed class":x.studentAccessStatus==="pending_review"?"Review the student's account request":x.studentAccessStatus==="approved"?"Prepare the student's first school day":"Complete the student's learning access"}</p>
            <p className="mt-1 text-sm text-muted-foreground">{x.activeSectionCount===0?"Use Class placement below to select an eligible section.":x.studentAccessStatus==="approved"?"Confirm the school's scheduled day and local supervision separately from enrollment.":"Use the student learning-access section below. Guardian consent and independent identity review remain required."}</p>
           </> : latest?.status==="accepted" ? <>
            <p className="mt-2 font-semibold">Activate the accepted enrollment and class placement</p>
            <p className="mt-1 text-sm text-muted-foreground">Select a staffed section in Class placement below. If a transfer or eligibility check blocks activation, follow its specific resolution instructions.</p>
           </> : latest?.status==="issued" ? <>
            <p className="mt-2 font-semibold">Waiting for the family to respond</p>
            <p className="mt-1 text-sm text-muted-foreground">The guardian reviews and accepts the offer in their own account. No registrar action is needed until a response or follow-up is required.</p>
           </> : x.disposition==="waitlisted" ? <>
            <p className="mt-2 font-semibold">Review waitlist status</p>
            <p className="mt-1 text-sm text-muted-foreground">Review availability and the application decision before issuing another offer.</p>
            <Link to="/admissions/intake" search={{siteId:selected.siteId,programId:x.programId,application:x.id}} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold underline">Open admissions review →</Link>
           </> : x.outstandingRequirements>0 ? <>
            <p className="mt-2 font-semibold">Review {x.outstandingRequirements} outstanding enrollment requirement{x.outstandingRequirements===1?"":"s"}</p>
            <Link to="/admissions/families" search={{siteId:selected.siteId,programId:x.programId,application:x.id}} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold underline">Review household requirements →</Link>
           </> : <>
            <p className="mt-2 font-semibold">Review application and offer eligibility</p>
            <Link to="/admissions/intake" search={{siteId:selected.siteId,programId:x.programId,application:x.id}} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold underline">Open admissions review →</Link>
           </>}
          </section>
          {x.disposition==="waitlisted"&&<p role="status" className="mt-2 text-sm">Waitlisted - restore this application to review in admissions intake before issuing an offer.</p>}
          <Link to="/admissions/intake" search={{siteId:selected.siteId,programId:x.programId,application:x.id}} className="mt-2 inline-block text-xs underline">Manage admissions decisions and waitlist →</Link>
          <div className="mt-3 flex flex-wrap gap-2">{x.offers.map(o => <span key={o.id} className="rounded-lg border px-3 py-1 text-xs">Offer: {o.status}{o.expiresAt ? ` · Expires ${new Date(o.expiresAt).toLocaleDateString()}` : ""}</span>)}{!latest && <span className="text-xs text-muted-foreground">No currently actionable offer</span>}</div>
          {activated && <p className="mt-3 text-sm font-semibold">Enrollment active · Student is enrolled in this school year</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {!years.length && !latest && (x.stage==="application"||x.stage==="eligibility") &&
              <p role="status" className="text-sm">No school-year seat pool is configured for this application.{" "}
                <Link to="/admissions/capacity" search={{siteId:selected.siteId,programId:x.programId}}
                  className="underline">Configure program capacity →</Link>
              </p>}
            {years.filter(year => canIssueAnotherOffer(x.stage, x.outstandingRequirements, x.offers, year.id,new Date(),x.disposition)).map(year => <button key={year.id} disabled={busy} className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50" onClick={() => transact(() => issueAdmissionOffer({ data: { applicationId: x.id, schoolYearId: year.id } }))}>Registrar: Issue offer · {year.name}</button>)}
            {latest?.status === "issued" && <p className="text-xs text-muted-foreground">Waiting for guardian response in the guardian enrollment-offers workspace.</p>}
            {latest?.status === "accepted" && !activated && <p role="status" className="text-xs">Accepted offer ready. Select a staffed class below to activate enrollment and placement together.</p>}
          </div>
          {x.offers.filter(offer=>offer.status==="issued").map(offer=><OfferWithdrawal key={offer.id} offerId={offer.id}/>)}
          {(x.enrollments.length > 0 || latest?.status === "accepted") &&
             <CoursePlacement applicationId={x.id}
               acceptedOfferId={latest?.status==="accepted"?latest.id:undefined}
               enrollmentActivated={activated} />}
          {activated&&<StudentLearningAccessHandoff applicationId={x.id} role="registrar"/>}
          {activated&&<FirstSchoolDayHandoff applicationId={x.id} programId={x.programId}/>}
          {activated&&<div className="mt-3 rounded-lg border p-3 text-sm">
            <p className="font-semibold">Enrollment → learning → supervised school day</p>
            <ol className="mt-2 space-y-1 text-muted-foreground" aria-label="School start handoff">
              <li>1. School-year enrollment active.</li>
              <li>2. {x.activeSectionCount>0
                ? `${plural(x.activeSectionCount,"active instructional class assignment")} recorded.`
                : "Assign a staffed instructional class above before starting student learning access."}</li>
              <li>3. {x.studentAccessStatus==="approved"
                ? "Separate student learning account approved. The student signs in with their own email."
                : x.studentAccessStatus==="access_unavailable"
                  ? "Prior approval remains on record, but the actual student login grant is inactive or unavailable. Review the student-access restoration workflow."
                  : x.studentAccessStatus==="pending_review"
                    ? "Guardian consent received. Complete the independent registrar identity review above."
                    : "Guardian must authorize a separate student account; registrar then verifies the student's identity."}</li>
              <li>4. Site staff confirm an actual scheduled school day, expected onsite roster, supervision
                and physical attendance. Enrollment never records presence automatically.</li>
            </ol>
            {x.activeSectionCount>0
              ? <Link to="/staff/attendance" search={{programId:x.programId}} className="mt-2 inline-block font-semibold underline">
                  Open expected school-day attendance →
                </Link>
              : <p className="mt-2 text-xs">The school-day attendance handoff opens after a class is assigned.</p>}
          </div>}
          <Link to="/admissions/families" search={{siteId:selected.siteId,programId:x.programId,application:x.id}} className="mt-3 inline-block text-xs font-semibold underline">Manage household readiness →</Link>
        </article>;
      })}
        {!selected.application && !rows.length && <EmptyState title="No applications are available in your authorized programs." />}</div>
    </WorkspaceShell>
  );
}

type AdmissionsRow=Awaited<ReturnType<typeof loadAdmissions>>["rows"][number];

function nextStep(row:AdmissionsRow){
  const offer=selectActionableOffer(row.offers);
  return row.enrollments.length && row.activeSectionCount===0?"Assign staffed instructional class":
   row.enrollments.length && row.studentAccessStatus==="access_unavailable"?"Review revoked student access":
   row.enrollments.length && row.studentAccessStatus==="pending_review"?"Review student sign-in request":
   row.enrollments.length && row.studentAccessStatus==="not_requested"?"Await guardian student sign-in consent":
   row.enrollments.length && row.studentAccessStatus==="approved"?"Prepare scheduled onsite school day":
   row.enrollments.length?"Review student access":
   row.stage==="declined"||row.stage==="withdrawn"?"Review closed application":
   row.disposition==="waitlisted"?"Restore waitlisted application to review":
   row.outstandingRequirements>0?`Review ${plural(row.outstandingRequirements,"blocking requirement")}`:
   offer?.status==="issued"?"Awaiting family response":
   offer?.status==="accepted"&&!row.enrollments.some(enrollment=>enrollment.schoolYearId===offer.schoolYearId)?"Activate accepted enrollment":
   row.stage==="accepted"?"Review offer eligibility":"Review application evidence";
}

function OfferWithdrawal({offerId}:{offerId:string}){
 const router=useRouter();
 const [reason,setReason]=useState(""),[confirmed,setConfirmed]=useState(false);
 const [attempted,setAttempted]=useState(false);
 const mutation=useMutationFeedback(()=>router.invalidate());
 const busy=mutation.pending||mutation.refreshFailed;
 const [error,setError]=useState("");
 return <details className="mt-3 rounded border p-3 text-sm">
  <summary>Withdraw an unaccepted offer</summary>
  <p className="mt-2">This releases the offered seat without deleting the application or its history.
   Accepted offers and active enrollments cannot be withdrawn here.</p>
  <form noValidate className="mt-3 space-y-3" onSubmit={async event=>{
   event.preventDefault();
   setAttempted(true);
   if(!confirmed||reason.trim().length<10)return;
   setError("");
   await mutation.run(()=>withdrawIssuedAdmissionOffer({data:{offerId,reason,confirmed:true}}),{
    successMessage:"Offer withdrawn. The family will be notified.",commandErrorMessage:"Unable to withdraw offer"});
  }}>
   <Field label="Reason for withdrawal (internal)" required
    error={attempted&&reason.trim().length<10?"Enter at least 10 characters explaining the withdrawal.":undefined}>
    <Textarea required minLength={10} maxLength={2000} value={reason} onChange={event=>setReason(event.target.value)}/>
   </Field>
   <Field label="I confirm withdrawal of this unaccepted offer. The family will be notified." required
    error={attempted&&!confirmed?"Confirm the withdrawal and family notification.":undefined}>
    <Checkbox required checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>
   </Field>
   <Button type="submit" variant="outline" disabled={busy || !confirmed || reason.trim().length<10}>Withdraw offer</Button>
   {error&&<p role="alert">{error}</p>}
   <MutationFeedback state={mutation} pendingMessage="Withdrawing offer..."/>
  </form>
 </details>;
}

function CoursePlacement({ applicationId, acceptedOfferId, enrollmentActivated }: {
  applicationId: string; acceptedOfferId?: string; enrollmentActivated: boolean;
}) {
  const router = useRouter();
  const [sections, setSections] = useState<Awaited<ReturnType<typeof listEnrollmentPlacements>>["sections"]>([]);
  const [loaded, setLoaded] = useState(false);
  const [chosen, setChosen] = useState("");
  const [transferBlocker,setTransferBlocker]=useState<string|null>(null);
  const [reading, setReading] = useState(false);
  const mutation = useMutationFeedback(async () => { await refresh(); await router.invalidate(); });
  const busy = reading || mutation.pending || mutation.refreshFailed;
  const [error, setError] = useState("");
  // An activated student's eligible classes should be visible immediately.
  // Reload on application change, and never reuse another child's prior choices.
  useEffect(() => {
    let current = true;
    setSections([]);
    setChosen("");
    setTransferBlocker(null);
    setError("");
    setLoaded(false);
    listEnrollmentPlacements({ data: { applicationId } }).then(result => {
      if (current) { setSections(result.sections); setTransferBlocker(result.transferBlocker); setLoaded(true); }
    }).catch(cause => {
      if (current) { setError(mutationErrorMessage(cause, "Cannot load course placements")); setLoaded(true); }
    });
    return () => { current = false; };
  }, [applicationId]);
  async function refresh() {
    const result = await listEnrollmentPlacements({ data: { applicationId } });
    setSections(result.sections);
    setTransferBlocker(result.transferBlocker);
    // A section selected before the refresh may no longer be staffed or have
    // capacity. Require an explicit fresh choice rather than carrying it over.
    setChosen("");
    setLoaded(true);
  }
  async function open() {
    if (busy) return;
    setReading(true); setError("");
    try { await refresh(); }
    catch(e) { setError(mutationErrorMessage(e, "Cannot load course placements")); }
    finally { setReading(false); }
  }
  async function place() {
    if (!chosen || (acceptedOfferId&&!enrollmentActivated&&transferBlocker)) return;
    setError("");
    await mutation.run(async () => {
      if(acceptedOfferId&&!enrollmentActivated)
        await activateOfferedEnrollment({data:{offerId:acceptedOfferId,sectionId:chosen}});
      else await placeEnrolledStudent({ data: { applicationId, sectionId: chosen } });
      setChosen("");
    }, { successMessage: "Course placement saved.", commandErrorMessage: "Cannot assign course" });
  }
  return <section className="mt-4 rounded-lg border bg-card p-4" aria-label="Course placement">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">Course placement</h3>
      <button type="button" disabled={busy} onClick={open}
        className="rounded-md border px-3 py-1.5 text-xs disabled:opacity-50">
        Refresh eligible classes
      </button>
    </div>
    {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
    <MutationFeedback state={mutation} pendingMessage="Saving course placement..." className="mt-2"/>
    {acceptedOfferId&&!enrollmentActivated&&transferBlocker&&
      <p role="status" className="mt-3 rounded-lg border p-3 text-sm">
        <strong>Receiving-school enrollment blocked:</strong> {transferBlocker}
        {" "}The family may retain an accepted offer while the origin school finishes its exit.
        <Link to="/admissions/intake" search={{application:applicationId}} className="ml-2 font-semibold underline">Review this application →</Link>
      </p>}
    {!loaded && !error && <p role="status" className="mt-3 text-xs text-muted-foreground">Loading eligible classes…</p>}
    {loaded && <div className="mt-3 space-y-3">
      <div className="flex flex-wrap gap-2">
        {sections.filter(s => s.enrolled).map(s =>
          <span key={s.id} className="rounded-full border px-2 py-1 text-xs">Assigned: {s.title}</span>)}
      </div>
      {sections.some(s => !s.enrolled && !s.readyForPlacement) && <p role="status" className="text-xs text-warning">
        Some classes cannot accept students yet: verify an institutional teacher
        with a published first lesson, a current CAN–church academic agreement,
         an open add/drop window, and available Section capacity.
      </p>}
      {sections.some(s => !s.enrolled && s.readyForPlacement) ? <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-48 flex-1 text-xs">Available section
          <select value={chosen} onChange={e => setChosen(e.target.value)}
            className="mt-1 block w-full rounded-md border bg-background p-2">
            <option value="">Select a section</option>
            {sections.filter(s => !s.enrolled && s.readyForPlacement).map(s =>
              <option key={s.id} value={s.id}>{s.title} ({s.code})</option>)}
          </select>
        </label>
        <button type="button" disabled={!chosen || busy || !!(acceptedOfferId&&!enrollmentActivated&&transferBlocker)} onClick={place}
          className="rounded-md bg-foreground px-3 py-2 text-xs font-semibold text-background disabled:opacity-50">
          {acceptedOfferId&&!enrollmentActivated?"Activate enrollment and assign class":"Assign student"}
        </button>
      </div> : <p className="text-xs text-muted-foreground">
        {sections.length
          ? sections.every(s => s.enrolled) ? "All currently available sections are assigned."
            : "No class is ready for placement: verify its teacher, first lesson, operating agreement, remaining capacity and add/drop deadline."
          : acceptedOfferId&&!enrollmentActivated
            ? "No eligible sections are configured for the accepted offer's school year. Review its calendar, staffed classes, and enrollment capacity."
            : "No eligible sections are configured for this student's active school year."}
      </p>}
    </div>}
  </section>;
}

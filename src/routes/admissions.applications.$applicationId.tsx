import { createFileRoute, Link } from "@tanstack/react-router";
import { listAdmissionsIntake } from "@/modules/enrollment/admissions-intake.functions";
import { getAdmissionsDashboard } from "@/modules/enrollment/admissions-dashboard.functions";
import { getAdmissionOfferOptions } from "@/modules/enrollment/admissions-offer.functions";
import { getFamilyReadiness } from "@/modules/enrollment/family-readiness.functions";
import { admissionsProgress, type AdmissionsStepKey } from "@/domain/admissions-next-step";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { WorkspaceShell, StatusBadge } from "@/components/workspace";
import { ApplicationPacketReview } from "@/components/enrollment/ApplicationPacketReview";
import { AdmissionsDecisionPanel } from "@/components/enrollment/AdmissionsDecisionPanel";
import { AdmissionsOfferPanel } from "@/components/enrollment/AdmissionsOfferPanel";
import { ApplicationReadinessPanel } from "@/components/enrollment/ApplicationReadinessPanel";

const loadApplication = async (applicationId: string) => {
  const record = (await listAdmissionsIntake()).find(row => row.id === applicationId);
  if (!record) throw new Error("This application was not found in your admissions programs.");
  const selection = { programId: record.programId, ...(record.siteId ? { siteId: record.siteId } : {}) };
  const [rows, options, readiness] = await Promise.all([
    getAdmissionsDashboard({ data: selection }),
    getAdmissionOfferOptions({ data: selection }),
    getFamilyReadiness({ data: selection }),
  ]);
  const pipeline = rows.find(row => row.id === applicationId);
  if (!pipeline) throw new Error("This application was not found in your admissions programs.");
  return {
    record, pipeline,
    years: options.find(option => option.applicationId === applicationId)?.years ?? [],
    readiness: readiness.find(row => row.id === applicationId) ?? null,
  };
};

export const Route = createFileRoute("/admissions/applications/$applicationId")({
  loader: ({ params }) => safeLoader(() => loadApplication(params.applicationId), {
    authMessage: "Sign in with an authorized registrar account to review this application.",
  })(),
  component: ApplicantDetailPage,
});

function ApplicantDetailPage() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) return <LoaderFailure eyebrow="CAN OS · Admissions" title="Applicant detail" outcome={outcome} />;
  return <ApplicantDetail data={outcome.data} />;
}

const sectionFor: Partial<Record<AdmissionsStepKey, string>> = {
  eligibility: "decisions", "verify-guardian": "decisions", "provision-guardian": "decisions", approve: "decisions",
  requirements: "requirements", "issue-offer": "offers", activate: "offers", place: "offers",
};

function ApplicantDetail({ data }: { data: Awaited<ReturnType<typeof loadApplication>> }) {
  const { record: r, pipeline: p, years, readiness } = data;
  const progress = admissionsProgress({
    stage: r.stage, disposition: r.disposition, submitted: !r.applicantDraft, journeyStarted: p.journeyStarted,
    guardianVerified: r.guardianVerified, guardianLoginProvisioned: r.guardianLoginProvisioned,
    outstandingRequirements: p.outstandingRequirements, offers: p.offers,
    activeEnrollments: p.enrollments.length, placedSections: p.placedSections,
  });
  const name = `${r.studentFirst} ${r.studentLast}`;
  const statusLabel = r.applicantDraft ? "draft" : r.disposition === "waitlisted" ? "waitlisted" : r.disposition === "ready_for_offer" ? "ready for offer" : r.stage;
  const next = progress.next;
  const jump = next ? sectionFor[next.key] : undefined;
  return <WorkspaceShell width="wide" eyebrow="CAN OS · Admissions" title={name}
    breadcrumbs={<Link to="/admissions" search={{ siteId: r.siteId ?? undefined, programId: r.programId }} className="underline">← Admissions pipeline</Link>}
    subtitle={`${r.programName} · ${p.submittedAt ? `Submitted ${new Date(p.submittedAt).toLocaleDateString()}` : "Not submitted"} · Last updated ${new Date(r.updatedAt).toLocaleDateString()}`}
    actions={<StatusBadge tone={progress.status === "in_progress" && next?.owner === "registrar" ? "attention" : "neutral"}>{statusLabel}</StatusBadge>}>
    <section aria-label="Next step" className="mt-6 rounded-xl border-2 border-foreground/20 bg-card p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Next step</p>
      {progress.status === "closed" ? <p className="mt-2 font-serif text-2xl">This application is closed ({r.stage}). No further admissions action is required.</p>
        : progress.status === "complete" ? <p className="mt-2 font-serif text-2xl">Enrollment complete: the student is active and placed in courses.</p>
        : next && <>
          <p className="mt-2 font-serif text-2xl">{next.owner === "family" ? "Waiting on the family: " : ""}{next.title}</p>
          {progress.status === "waitlisted" && <p className="mt-1 text-sm">This application is waitlisted. Restore it to review before continuing.</p>}
          {next.key === "eligibility" && p.journeyStarted === false && <p className="mt-1 text-sm text-muted-foreground">Starting eligibility review creates the enrollment requirements checklist for this program.</p>}
          {next.key === "issue-offer" && !years.length && <p className="mt-1 text-sm">No seat pool is configured for this program. <Link to="/admissions/capacity" search={{ siteId: r.siteId ?? undefined, programId: r.programId }} className="underline">Create one on the capacity page →</Link></p>}
          {next.key === "family-accepts" && <p className="mt-1 text-sm text-muted-foreground">The verified guardian accepts from their guardian workspace under Enrollment offers.</p>}
          {jump && <a href={`#${jump}`} className="mt-3 inline-block text-sm font-semibold underline">Go to this step ↓</a>}
        </>}
      <ol className="mt-5 grid gap-2 sm:grid-cols-2" aria-label="Admissions steps">
        {progress.steps.map((step, i) => <li key={step.key} aria-current={step.key === next?.key ? "step" : undefined}
          className={`flex items-start gap-2 rounded-lg border p-2 text-sm ${step.key === next?.key ? "border-foreground font-semibold" : ""} ${step.done ? "text-muted-foreground" : ""}`}>
          <span aria-hidden className="w-5 shrink-0 text-center">{step.done ? "✓" : i + 1}</span>
          <span>{step.title}<span className="block text-xs font-normal text-muted-foreground">{step.done ? "Done" : step.owner === "family" ? "Family" : "Registrar"}</span></span>
        </li>)}
      </ol>
    </section>

    {r.applicationPacket && <section aria-labelledby="packet-heading" className="mt-8 rounded-xl border bg-card p-5">
      <h2 id="packet-heading" className="font-serif text-2xl">Application packet</h2>
      <div className="mt-4"><ApplicationPacketReview packet={r.applicationPacket} statement={r.applicantStatement ?? ""} /></div>
    </section>}
    {!r.applicationPacket && r.applicantStatement && <p className="mt-6 whitespace-pre-wrap text-sm">Family statement: {r.applicantStatement}</p>}

    <section id="decisions" aria-labelledby="decisions-heading" className="mt-8 scroll-mt-6 rounded-xl border bg-card p-5">
      <h2 id="decisions-heading" className="font-serif text-2xl">Guardian and admissions decision</h2>
      <AdmissionsDecisionPanel record={r} />
    </section>

    <section id="requirements" aria-labelledby="requirements-heading" className="mt-8 scroll-mt-6 rounded-xl border bg-card p-5">
      <h2 id="requirements-heading" className="font-serif text-2xl">Enrollment requirements</h2>
      {readiness ? <>
        <p className="mt-2 text-sm text-muted-foreground">Journey: {readiness.journeyStatus?.replaceAll("_", " ") ?? "Not started"} · {readiness.readiness.completed} of {readiness.readiness.total} complete · {readiness.readiness.blockers} blocking</p>
        <ApplicationReadinessPanel application={readiness} />
      </> : <p className="mt-2 text-sm text-muted-foreground">The requirements checklist is created when eligibility review begins.</p>}
    </section>

    <section id="offers" aria-labelledby="offers-heading" className="mt-8 scroll-mt-6 rounded-xl border bg-card p-5">
      <h2 id="offers-heading" className="font-serif text-2xl">Offer, enrollment and course placement</h2>
      {r.applicantDraft ? <p className="mt-2 text-sm text-muted-foreground">Offers open after the family submits the application.</p>
        : <AdmissionsOfferPanel application={p} years={years} />}
    </section>
  </WorkspaceShell>;
}

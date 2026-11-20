import { Link } from "@tanstack/react-router";
import type { getGuardianAdmissionOffers } from "@/modules/enrollment/guardian-admission-offers.functions";

type EnrollmentApplication = Awaited<ReturnType<typeof getGuardianAdmissionOffers>>[number];

/** Read-only, authorized family application summary. Does not change offers
 * or infer an active student enrollment from application stage.
 */
export function GuardianEnrollmentNextSteps({
  applications: visibleEnrollmentApplications, enrollmentWarning, activeStudent,
}: {
  applications: readonly EnrollmentApplication[];
  enrollmentWarning?: string;
  activeStudent?: string;
}) {
  return <>
{(visibleEnrollmentApplications.length>0||enrollmentWarning)&&<section aria-label="Enrollment next steps" className="mt-6  border border-border/70 bg-card p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
     <div><p className="text-xs font-bold uppercase tracking-widest text-primary">Getting started</p>
      <h2 className="mt-1 font-serif text-2xl font-semibold">School enrollment</h2></div>
     <Link to="/guardian/admission-offers" search={{student:activeStudent}}
      className="inline-flex min-h-11 items-center  border px-4 py-2 text-sm font-semibold">View applications and offers</Link>
    </div>
    {enrollmentWarning&&<p role="status" className="mt-3  border p-3 text-sm">{enrollmentWarning}</p>}
    {!enrollmentWarning&&visibleEnrollmentApplications.length>0&&<div className="mt-4 grid gap-3">
     {visibleEnrollmentApplications.map(app=>{
      const active=app.offers.find(o=>o.enrollmentActive);
      const issued=app.offers.find(o=>o.status==="issued"&&o.progress.canAccept);
      const accepted=app.offers.find(o=>o.status==="accepted");
      const next=active?"Enrollment is active. Review first-day preparation and student access.":
       accepted?"Your offer is accepted. The school is completing enrollment and class placement.":
       issued?"An enrollment offer is ready for your decision.":
       app.waitlisted?"Your application is on the waitlist. Contact admissions for an update.":
       app.blockers.length>0||app.offers.some(o=>o.progress.state==="requirements_pending")
         ?"Review the outstanding enrollment requirements before accepting an offer.":
       "Your application is with the school. Review its status and any requested steps.";
      return <article key={app.applicationId} className=" border p-4">
       <p className="font-semibold">{app.studentName} <span className="font-normal text-muted-foreground">· {app.program}</span></p>
       <p className="mt-2 text-sm">{next}</p>
       <Link to="/guardian/admission-offers" search={{student:app.studentPersonId,application:app.applicationId}}
        className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold underline">
        {active?"Prepare for school":accepted?"View enrollment steps":issued?"Review offer":"View enrollment steps"} →
       </Link>
      </article>;
     })}
    </div>}
   </section>}
  </>;
}

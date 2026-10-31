import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { WorkspaceShell } from "@/components/workspace";
import { getGuardianHealthWorkspace } from "@/modules/health/guardian-health.functions";
import { requestGuardianHealthUpdate } from "@/modules/health/guardian-health-updates.functions";

export const Route = createFileRoute("/guardian/health")({
  validateSearch: (search: Record<string, unknown>): { student?: string } => ({
    student: typeof search.student === "string" ? search.student : undefined,
  }),
  component: GuardianHealthPage,
});

type Workspace = Awaited<ReturnType<typeof getGuardianHealthWorkspace>>;

function GuardianHealthPage() {
  const { student } = Route.useSearch();
  const [data, setData] = useState<Workspace | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    let current = true;
    setLoading(true); setData(null); setError("");
    void getGuardianHealthWorkspace({ data: { studentPersonId: student } })
      .then(result => { if (current) setData(result); })
      .catch(() => { if (current) setError("Unable to verify family access to school health records."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [student, refreshKey]);

  return <WorkspaceShell width="wide" eyebrow="CAN OS · Family"
    title="Health and return-to-school"
    subtitle="Review the school's recorded health instructions, compliance status and return clearance. Medical decisions and changes require authorized school review."
    breadcrumbs={<><Link to="/guardian" search={{student}} className="underline">Family home</Link><span>/</span><span>Health</span></>}>
    <div className="mt-6 flex flex-wrap gap-3 text-sm">
      <button type="button" disabled={loading} onClick={() => setRefreshKey(current => current + 1)}
        className="rounded-lg border px-4 py-2 font-semibold disabled:opacity-50">
        {loading ? "Checking school review…" : "Refresh school review status"}
      </button>
      <Link to="/messages" className="rounded-lg border px-4 py-2 font-semibold">Contact the school about a health update</Link>
      <Link to="/guardian/attendance" search={{student}} className="rounded-lg border px-4 py-2">Attendance and excuses</Link>
    </div>
    {loading && <p className="mt-6" role="status">Loading verified school health records…</p>}
    {error && <p className="mt-6 rounded-lg border p-4" role="alert">{error}</p>}
    {data && data.children.length === 0 && <p className="mt-6 rounded-lg border p-4">No health records are available for this authorized student. If the child has recently enrolled or transferred, contact the school.</p>}
    {data?.children.map(child => <section key={child.studentPersonId} className="mt-6 space-y-4 rounded-xl border bg-card p-5">
      <h2 className="text-xl font-semibold">{child.studentName}</h2>
      {child.awaitingSchoolHealthReview ? (
        <p role="status" className="rounded-lg border p-4 text-sm">
          <strong>School review pending.</strong> Your proposed emergency and medical information has not been approved.
          The school-recorded instructions below remain authoritative until staff complete their review.
        </p>
      ) : child.lastSchoolReview?.status === "approved" ? (
        <p role="status" className="rounded-lg border p-4 text-sm">
          <strong>Family update approved.</strong> The school reviewed your request on{" "}
          {new Date(child.lastSchoolReview.reviewedAt).toLocaleDateString()}.
          The approved instructions below reflect the school's current record.
        </p>
      ) : child.lastSchoolReview?.status === "rejected" ? (
        <p role="status" className="rounded-lg border p-4 text-sm">
          <strong>School needs clarification.</strong> Your last proposed health update was not approved
          ({new Date(child.lastSchoolReview.reviewedAt).toLocaleDateString()}).
          The school-recorded instructions below have not been replaced. You may correct and
          resubmit the information or contact the school office.
        </p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border p-4">
          <h3 className="font-semibold">School-recorded medical instructions</h3>
          <p className="mt-3 text-sm"><strong>Allergies:</strong> {child.profile?.allergySummary || "No allergy summary recorded"}</p>
          <p className="mt-2 text-sm"><strong>Emergency instructions:</strong> {child.profile?.emergencySummary || "No emergency summary recorded"}</p>
          <p className="mt-2 text-sm"><strong>Accommodations:</strong> {child.profile?.accommodationSummary || "No accommodations recorded"}</p>
          <p className="mt-3 text-xs text-muted-foreground">Contact the school if anything here is missing or inaccurate. This page does not change the medical record.</p>
        </div>
        <div className="rounded-lg border p-4">
          <h3 className="font-semibold">Health requirements</h3>
          {child.compliance.map((item, i) => <p key={i} className="mt-3 text-sm">
            <strong>{item.type.replaceAll("_", " ")}:</strong> {item.status.replaceAll("_", " ")}
            {item.dueOn && <span> · Due {item.dueOn}</span>}
            {item.expiresOn && <span> · Expires {item.expiresOn}</span>}
          </p>)}
          {!child.compliance.length && <p className="mt-3 text-sm">No health requirements have been recorded.</p>}
        </div>
        <div className="rounded-lg border p-4">
          <h3 className="font-semibold">Medication authorizations</h3>
          {child.medications.map((item, i) => <p key={i} className="mt-3 text-sm">
            <strong>{item.medicationName}:</strong> {item.status.replaceAll("_", " ")}
            {item.emergencyOnly && <span> · Emergency use</span>}
            {item.expiresOn && <span> · Expires {item.expiresOn}</span>}
          </p>)}
          {!child.medications.length && <p className="mt-3 text-sm">No medication authorization is on file. Do not assume a medication may be administered.</p>}
        </div>
        <div className="rounded-lg border p-4">
          <h3 className="font-semibold">Return-to-school clearances</h3>
          {child.clearances.map((item, i) => <p key={i} className="mt-3 text-sm">
            <strong>{item.status.replaceAll("_", " ")}</strong> · {new Date(item.date).toLocaleDateString()}
            {item.clearedAt && <span> · Cleared {new Date(item.clearedAt).toLocaleDateString()}</span>}
          </p>)}
          {!child.clearances.length && <p className="mt-3 text-sm">No return-to-school clearance requirement is recorded.</p>}
        </div>
      </div>
      <GuardianHealthUpdateForm child={child} onSubmitted={() => setRefreshKey(current => current + 1)}/>
      <div className="rounded-lg border p-4">
        <h3 className="font-semibold">Recent health-office visits</h3>
        {child.visits.map((visit, i) => <p key={i} className="mt-2 text-sm">
          {new Date(visit.date).toLocaleString()} · {visit.reason}
          {visit.sentHome && <strong> · Sent home</strong>}
        </p>)}
        {!child.visits.length && <p className="mt-2 text-sm">No recent health-office visits are recorded.</p>}
      </div>
    </section>)}
  </WorkspaceShell>;
}

type Child=Workspace["children"][number];

function GuardianHealthUpdateForm({child,onSubmitted}:{child:Child;onSubmitted:()=>void}){
 const [allergies,setAllergies]=useState(child.profile?.allergySummary??"");
 const [emergency,setEmergency]=useState(child.profile?.emergencySummary??"");
 const [accommodations,setAccommodations]=useState(child.profile?.accommodationSummary??"");
 const [name,setName]=useState(child.approvedEmergencyContact?.name??"");
 const [phone,setPhone]=useState(child.approvedEmergencyContact?.phone??"");
 const [relationship,setRelationship]=useState(child.approvedEmergencyContact?.relationship??"");
 const [busy,setBusy]=useState(false),[submitted,setSubmitted]=useState(false);
 const [notice,setNotice]=useState(""),[error,setError]=useState("");
 async function submit(event:FormEvent){
  event.preventDefault();
  if(busy||submitted||child.awaitingSchoolHealthReview)return;
  setBusy(true);setNotice("");setError("");
  try{
   await requestGuardianHealthUpdate({data:{
    studentPersonId:child.studentPersonId,programId:child.programId,
    allergySummary:allergies,emergencySummary:emergency,
    accommodationSummary:accommodations,
    emergencyContactName:name,emergencyContactPhone:phone,
    emergencyContactRelationship:relationship,
   }});
   setSubmitted(true);
   setNotice("Submitted for school review. Your changes are not yet approved emergency or medical instructions.");
   onSubmitted();
  }catch(e){setError(e instanceof Error?e.message:"School health information could not be submitted.");}
  finally{setBusy(false);}
 }
 return <form onSubmit={event=>void submit(event)} className="space-y-3 rounded-lg border p-4">
  <h3 className="font-semibold">Update emergency and health information</h3>
  <p className="text-sm text-muted-foreground">Request corrections to the existing school medical record. Only authorized school staff can approve them. If your child needs immediate help, call the school directly; this form is not monitored as an emergency service.</p>
  {child.awaitingSchoolHealthReview?<p role="status" className="rounded border p-3 text-sm">A previous update is pending school review. Contact the office for urgent changes.</p>:<>
   <label className="block text-sm font-medium">Allergy instructions
    <textarea value={allergies} onChange={e=>setAllergies(e.target.value)} maxLength={2000} rows={2} className="mt-1 block w-full rounded border bg-background p-2"/>
   </label>
   <label className="block text-sm font-medium">Emergency instructions
    <textarea value={emergency} onChange={e=>setEmergency(e.target.value)} maxLength={2000} rows={2} className="mt-1 block w-full rounded border bg-background p-2"/>
   </label>
   <label className="block text-sm font-medium">Accommodations requiring school review
    <textarea value={accommodations} onChange={e=>setAccommodations(e.target.value)} maxLength={2000} rows={2} className="mt-1 block w-full rounded border bg-background p-2"/>
   </label>
   <div className="grid gap-3 sm:grid-cols-2">
    <label className="block text-sm font-medium">Emergency contact's legal name
     <input value={name} onChange={e=>setName(e.target.value)} maxLength={150} className="mt-1 block w-full rounded border bg-background p-2"/>
    </label>
    <label className="block text-sm font-medium">Emergency contact phone
     <input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} maxLength={40} className="mt-1 block w-full rounded border bg-background p-2"/>
    </label>
    <label className="block text-sm font-medium">Relationship to child
     <input value={relationship} onChange={e=>setRelationship(e.target.value)} maxLength={80} className="mt-1 block w-full rounded border bg-background p-2"/>
    </label>
   </div>
   <button type="submit" disabled={busy||submitted} className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
    {busy?"Submitting…":submitted?"Awaiting school review":"Submit for school review"}
   </button>
  </>}
  {child.approvedEmergencyContact?.phone&&<p className="text-sm"><strong>Current school-approved contact:</strong> {child.approvedEmergencyContact.name} · {child.approvedEmergencyContact.phone} · {child.approvedEmergencyContact.relationship}</p>}
  {notice&&<p role="status" className="rounded border p-3 text-sm">{notice}</p>}
  {error&&<p role="alert" className="rounded border p-3 text-sm">{error}</p>}
 </form>;
}

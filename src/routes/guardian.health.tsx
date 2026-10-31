import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { WorkspaceShell } from "@/components/workspace";
import { getGuardianHealthWorkspace } from "@/modules/health/guardian-health.functions";

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
  useEffect(() => {
    let current = true;
    setLoading(true); setData(null); setError("");
    void getGuardianHealthWorkspace({ data: { studentPersonId: student } })
      .then(result => { if (current) setData(result); })
      .catch(() => { if (current) setError("Unable to verify family access to school health records."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [student]);

  return <WorkspaceShell width="wide" eyebrow="CAN OS · Family"
    title="Health and return-to-school"
    subtitle="Review the school's recorded health instructions, compliance status and return clearance. Medical decisions and changes require authorized school review."
    breadcrumbs={<><Link to="/guardian" search={{student}} className="underline">Family home</Link><span>/</span><span>Health</span></>}>
    <div className="mt-6 flex flex-wrap gap-3 text-sm">
      <Link to="/messages" className="rounded-lg border px-4 py-2 font-semibold">Contact the school about a health update</Link>
      <Link to="/guardian/attendance" search={{student}} className="rounded-lg border px-4 py-2">Attendance and excuses</Link>
    </div>
    {loading && <p className="mt-6" role="status">Loading verified school health records…</p>}
    {error && <p className="mt-6 rounded-lg border p-4" role="alert">{error}</p>}
    {data && data.children.length === 0 && <p className="mt-6 rounded-lg border p-4">No health records are available for this authorized student. If the child has recently enrolled or transferred, contact the school.</p>}
    {data?.children.map(child => <section key={child.studentPersonId} className="mt-6 space-y-4 rounded-xl border bg-card p-5">
      <h2 className="text-xl font-semibold">{child.studentName}</h2>
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

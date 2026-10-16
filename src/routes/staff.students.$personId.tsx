import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getStudent360 } from "@/modules/profiles/directory.functions";

export const Route = createFileRoute("/staff/students/$personId")({ component: Student360Page });

type Student360 = Awaited<ReturnType<typeof getStudent360>>;

function Student360Page() {
  const { personId } = Route.useParams();
  const [profile, setProfile] = useState<Student360 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getStudent360({ data: { studentPersonId: personId } })
      .then((result) => {
        if (active) {
          setProfile(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError("Sign in with an authorized staff account.");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [personId]);

  return (
    <main className="min-h-screen bg-background px-6 py-10 text-foreground">
      <div className="mx-auto max-w-5xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">CAN OS · Staff</p>
        {loading && <p className="mt-8 text-sm" role="status">Loading student profile…</p>}
        {error && <p className="mt-8 rounded-lg border p-4 text-sm" role="alert">{error}</p>}
        {profile && (
          <>
            <h1 className="mt-2 font-serif text-4xl">{profile.identity.name}</h1>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
              Grade {profile.identity.gradeLevel ?? "—"} · {profile.sections.length} active section
              {profile.sections.length === 1 ? "" : "s"}
            </p>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <section className="rounded-xl border bg-card p-5" aria-label="Academics">
                <h2 className="text-lg font-semibold">Academics</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Open missing work: {profile.academics.openMissingWorkCount}
                </p>
                {profile.academics.sections.length === 0 && (
                  <p className="mt-3 text-sm text-muted-foreground">No active sections.</p>
                )}
                <ul className="mt-3 grid gap-3">
                  {profile.academics.sections.map((section) => (
                    <li key={section.sectionId} className="rounded-lg border p-3 text-sm">
                      <p className="font-semibold">{section.title}</p>
                      <p className="mt-1 text-muted-foreground">
                        {section.letterGrade || section.percentage
                          ? `Finalized grade: ${section.letterGrade ?? ""}${
                              section.letterGrade && section.percentage ? " · " : ""
                            }${section.percentage ? `${section.percentage}%` : ""}`
                          : "No finalized grade yet"}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="rounded-xl border bg-card p-5" aria-label="Attendance">
                <h2 className="text-lg font-semibold">Attendance (last 30 days)</h2>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Absences</p>
                    <p className="mt-1 text-2xl font-semibold">{profile.attendance.absenceCount}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Tardies</p>
                    <p className="mt-1 text-2xl font-semibold">{profile.attendance.tardyCount}</p>
                  </div>
                </div>
                {profile.attendance.recentEvents.length > 0 && (
                  <ul className="mt-3 grid gap-2 text-sm">
                    {profile.attendance.recentEvents.map((event, index) => (
                      <li key={index} className="flex justify-between gap-3">
                        <span className="capitalize">{event.status}</span>
                        <span className="text-muted-foreground">
                          {new Date(event.expectedAt).toLocaleDateString()}
                          {event.sectionTitle ? ` · ${event.sectionTitle}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="rounded-xl border bg-card p-5" aria-label="Open actions">
                <h2 className="text-lg font-semibold">Open actions</h2>
                {profile.openActions.length === 0 && (
                  <p className="mt-3 text-sm text-muted-foreground">No open actions for this student.</p>
                )}
                <ul className="mt-3 grid gap-3">
                  {profile.openActions.map((action) => (
                    <li key={action.id} className="rounded-lg border p-3 text-sm">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="font-semibold">{action.title}</p>
                        <span className="rounded-full border px-3 py-1 text-xs capitalize">
                          {action.status.replaceAll("_", " ")}
                        </span>
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        {action.type.replaceAll("_", " ")}
                        {action.dueAt ? ` · Due ${new Date(action.dueAt).toLocaleDateString()}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="rounded-xl border bg-card p-5" aria-label="Insights">
                <h2 className="text-lg font-semibold">Recent insights</h2>
                {profile.insights.length === 0 && (
                  <p className="mt-3 text-sm text-muted-foreground">No insights recorded for this student.</p>
                )}
                <ul className="mt-3 grid gap-3">
                  {profile.insights.map((insight) => (
                    <li key={insight.id} className="rounded-lg border p-3 text-sm">
                      <p className="font-semibold">{insight.title}</p>
                      <p className="mt-1 text-muted-foreground">
                        {insight.type.replaceAll("_", " ")} · {new Date(insight.createdAt).toLocaleDateString()}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="rounded-xl border bg-card p-5" aria-label="Support referrals">
                <h2 className="text-lg font-semibold">Support referrals</h2>
                {profile.supportReferrals.length === 0 && (
                  <p className="mt-3 text-sm text-muted-foreground">No open support referrals.</p>
                )}
                <ul className="mt-3 grid gap-3">
                  {profile.supportReferrals.map((referral) => (
                    <li key={referral.id} className="rounded-lg border p-3 text-sm">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="font-semibold">{referral.title}</p>
                        <span className="rounded-full border px-3 py-1 text-xs capitalize">
                          {referral.stage.replaceAll("_", " ")}
                        </span>
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        {referral.category} · Opened {new Date(referral.createdAt).toLocaleDateString()}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="rounded-xl border bg-card p-5" aria-label="Guardians">
                <h2 className="text-lg font-semibold">Guardians</h2>
                {profile.guardians.length === 0 && (
                  <p className="mt-3 text-sm text-muted-foreground">No guardians on record.</p>
                )}
                <ul className="mt-3 grid gap-3">
                  {profile.guardians.map((guardian, index) => (
                    <li key={index} className="rounded-lg border p-3 text-sm">
                      <p className="font-semibold">{guardian.name}</p>
                      <p className="mt-1 capitalize text-muted-foreground">{guardian.relationshipLabel}</p>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

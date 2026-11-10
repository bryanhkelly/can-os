import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { WorkspaceShell } from "@/components/workspace";
import { formatTimestamp } from "@/modules/calendar/timezone";
import { listStudentFieldTrips } from "@/modules/field-trips/student-field-trips.functions";

const searchSchema = z.object({ trip: z.string().uuid().optional() });

export const Route = createFileRoute("/student/field-trips")({
  validateSearch: (search: Record<string, unknown>) => searchSchema.parse(search),
  loader: safeLoader(() => listStudentFieldTrips(), {
    authMessage: "Sign in with your student account to see your field trips.",
  }),
  component: StudentFieldTrips,
});

type Trip = Awaited<ReturnType<typeof listStudentFieldTrips>>[number];

function statusCopy(trip: Trip): string {
  if (trip.status === "permission_complete") return "Permission signed — you're cleared to attend.";
  if (trip.status === "declined") return "Participation declined. Talk with your family or school if plans change.";
  if (trip.permissionPending) return "Waiting on a parent or guardian to sign permission.";
  return "Check with your school about your permission status.";
}

function StudentFieldTrips() {
  const outcome = Route.useLoaderData();
  const search = Route.useSearch();
  if (!outcome.ok) return <LoaderFailure eyebrow="Learning" title="My field trips" outcome={outcome} />;
  const items = outcome.data;
  const money = (cents: number) => new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
  }).format(cents / 100);
  return (
    <WorkspaceShell
      eyebrow="Learning"
      title="My field trips"
      subtitle="Trips your school has invited you to, with departure details and your permission status. Parents sign permission from their own account."
      actions={<Link to="/calendar" className="rounded-lg border px-3 py-2 text-sm">Open calendar</Link>}
    >
      <div className="mt-7 space-y-4">
        {items.map(item => <article key={item.tripId}
          className={`rounded-xl border bg-card p-5 ${search.trip === item.tripId ? "border-primary ring-1 ring-primary" : ""}`}>
          <h2 className="text-xl font-semibold">{item.title}</h2>
          <p className="mt-2 text-sm">{item.destination}</p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-muted-foreground">Departure</dt>
              <dd>{formatTimestamp(item.departsAt, item.timezone)} ({item.timezone})</dd></div>
            <div><dt className="text-xs text-muted-foreground">Return</dt>
              <dd>{formatTimestamp(item.returnsAt, item.timezone)} ({item.timezone})</dd></div>
            <div><dt className="text-xs text-muted-foreground">Permission deadline</dt>
              <dd>{item.deadline ? formatTimestamp(item.deadline, item.timezone) : "Before departure"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Fee</dt>
              <dd>{item.feeAmountCents ? money(item.feeAmountCents) : "No fee"}</dd></div>
          </dl>
          <p className="mt-4 rounded-lg border p-3 text-sm">{statusCopy(item)}</p>
        </article>)}
        {items.length === 0 && <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          Your school has not invited you to any upcoming field trips.
        </p>}
      </div>
    </WorkspaceShell>
  );
}

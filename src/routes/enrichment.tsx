import { createFileRoute, Link } from "@tanstack/react-router";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { WorkspaceShell } from "@/components/workspace";
import { listEnrichmentCatalog } from "@/modules/activities/enrichment-family.functions";

export const Route = createFileRoute("/enrichment")({
  loader: safeLoader(() => listEnrichmentCatalog()),
  component: PublicEnrichment,
});

function PublicEnrichment() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) return <LoaderFailure eyebrow="CAN OS" title="Programs and camps" outcome={outcome}/>;
  const items = outcome.data;
  return <WorkspaceShell eyebrow="CAN OS · Enrichment"
    title="Summer camps and after-school programs"
    subtitle="Browse open enrollment programs at CAN partner sites. School-year enrollment is not required."
    actions={<Link to="/guardian/enrichment" className="rounded-lg border px-3 py-2 text-sm">Register your child</Link>}>
    <div className="mt-8 grid gap-4 sm:grid-cols-2">
      {items.length === 0 && <p className="text-sm text-muted-foreground">No programs are currently open for registration.</p>}
      {items.map(item => <article key={item.seasonId} className="rounded-xl border bg-card p-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.siteName}</p>
        <h2 className="mt-1 text-lg font-semibold">{item.name}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{item.seasonName} · {item.startsOn} to {item.endsOn}</p>
        {item.firstMeeting && item.meetingTimezone && <p className="mt-1 text-sm text-muted-foreground">
          First session: {new Intl.DateTimeFormat("en-US",{dateStyle:"medium",
            timeStyle:"short",timeZone:item.meetingTimezone}).format(new Date(item.firstMeeting))}
        </p>}
        <p className="mt-3 text-sm">
          {new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(
            (item.packages.length ? Math.min(...item.packages.map(p=>p.priceCents)) :
              item.feeAmountCents) / 100)}
          {item.packages.length ? " starting price · "+item.packages.length+" enrollment options"
            : " · "+(item.seatsRemaining === 0 ? "Waitlist" :
              item.seatsRemaining === null ? "Seats available" :
              `${item.seatsRemaining} seats remaining`)}
        </p>
        <Link to="/guardian/enrichment" className="mt-4 inline-block rounded-lg border px-3 py-2 text-sm font-semibold">
          View details and register
        </Link>
      </article>)}
    </div>
  </WorkspaceShell>;
}

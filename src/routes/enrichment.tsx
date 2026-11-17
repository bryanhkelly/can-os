import { createFileRoute, Link } from "@tanstack/react-router";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { EntityCard, WorkspaceShell } from "@/components/workspace";
import { listEnrichmentCatalog } from "@/modules/activities/enrichment-family.functions";

export const Route = createFileRoute("/enrichment")({
  loader: safeLoader(() => listEnrichmentCatalog()),
  component: PublicEnrichment,
});

function PublicEnrichment() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) return <LoaderFailure eyebrow="CAN OS" title="Programs and camps" outcome={outcome}/>;
  const items = outcome.data;
  return <WorkspaceShell eyebrow="Enrichment"
    title="Summer camps and after-school programs"
    subtitle="Browse open enrollment programs at CAN partner sites. School-year enrollment is not required.">
    <div className="mt-8 grid gap-4 sm:grid-cols-2">
      {items.length === 0 && <p className="text-sm text-muted-foreground">No programs are currently open for registration.</p>}
      {items.map(item => <EntityCard key={item.seasonId} title={item.name}
        subtitle={`${item.siteName} · ${item.seasonName}`}
        meta={<span>
          {new Intl.NumberFormat("en-US", {style:"currency",currency:"USD"}).format(
            (item.packages.length ? Math.min(...item.packages.map(p=>p.priceCents)) :
              item.feeAmountCents) / 100)}
          {item.packages.length ? ` starting price · ${item.packages.length} enrollment options`
            : ` · ${item.seatsRemaining === 0 ? "Waitlist"
              : item.seatsRemaining === null ? "Seats available"
              : `${item.seatsRemaining} seats remaining`}`}
        </span>}
        openLabel="View details and register"
        renderLink={({className,children}) => <Link to="/enrichment/$seasonId"
          params={{seasonId:item.seasonId}} className={className}>{children}</Link>}>
        <p>{item.startsOn} to {item.endsOn}</p>
        {item.firstMeeting && item.meetingTimezone && <p className="mt-2">
          First session: {new Intl.DateTimeFormat("en-US", {dateStyle:"medium",
            timeStyle:"short",timeZone:item.meetingTimezone}).format(new Date(item.firstMeeting))}
        </p>}
      </EntityCard>)}
    </div>
  </WorkspaceShell>;
}

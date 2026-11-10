import { createFileRoute, Link } from "@tanstack/react-router";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import {
  PageFrame, RecordHeader, RecordLayout, StatCard, StatusBadge,
  WorkspaceNotice, WorkspacePanel, secondaryActionClassName,
} from "@/components/workspace";
import { listEnrichmentCatalog } from "@/modules/activities/enrichment-family.functions";

export const Route = createFileRoute("/enrichment_/$seasonId")({
  loader: safeLoader(() => listEnrichmentCatalog()),
  component: EnrichmentOfferingDetailPage,
});

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function EnrichmentOfferingDetailPage() {
  const outcome = Route.useLoaderData();
  const { seasonId } = Route.useParams();
  if (!outcome.ok) return <LoaderFailure eyebrow="Enrichment" title="Program details" outcome={outcome} />;
  const offering = outcome.data.find(item => item.seasonId === seasonId);
  const backLink = <Link to="/enrichment" className="underline">Programs and camps</Link>;
  if (!offering) return <PageFrame width="wide">
    <RecordLayout header={<RecordHeader eyebrow="Enrichment" title="Program details" breadcrumbs={backLink} />}
      main={<WorkspaceNotice tone="danger">
        This program is no longer open for registration or is unavailable.
      </WorkspaceNotice>} />
  </PageFrame>;
  const firstMeeting = offering.firstMeeting && offering.meetingTimezone
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium", timeStyle: "short", timeZone: offering.meetingTimezone,
      }).format(new Date(offering.firstMeeting))
    : null;
  const startingPrice = offering.packages.length
    ? Math.min(...offering.packages.map(item => item.priceCents))
    : offering.feeAmountCents;
  const seats = offering.seatsRemaining === 0 ? "Waitlist"
    : offering.seatsRemaining === null ? "Seats available"
    : `${offering.seatsRemaining} seats remaining`;
  return <PageFrame width="wide">
    <RecordLayout
      header={<RecordHeader eyebrow="Enrichment" title={offering.name}
        breadcrumbs={backLink}
        subtitle={`${offering.siteName} · ${offering.seasonName}`}
        status={<StatusBadge tone={offering.registrationOpen ? "success" : "neutral"}>
          {offering.registrationOpen ? "Registration open" : "Registration closed"}
        </StatusBadge>}
        actions={<Link to="/guardian/enrichment" className={secondaryActionClassName}>Register your child</Link>} />}
      main={<>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label={offering.packages.length ? "Starting price" : "Program fee"}
            value={currency.format(startingPrice / 100)}
            hint={offering.packages.length ? `${offering.packages.length} enrollment options` : undefined} />
          <StatCard label="Season" value={<span className="text-lg">{offering.startsOn} to {offering.endsOn}</span>}
            hint={firstMeeting ? `First session ${firstMeeting}` : undefined} />
          <StatCard label="Availability" value={<span className="text-lg">{seats}</span>}
            hint={offering.capacity ? `Capacity ${offering.capacity}` : undefined} />
        </div>
        {offering.packages.length > 0 && <WorkspacePanel title="Enrollment options"
          description="Choose an option during registration.">
          <ul className="space-y-2">
            {offering.packages.map(item => <li key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
              <span>{item.title}</span>
              <span className="flex items-center gap-3">
                <span className="font-semibold">{currency.format(item.priceCents / 100)}</span>
                <StatusBadge tone={item.available && (item.seatsRemaining ?? 1) > 0 ? "success" : "neutral"}>
                  {!item.available ? "Unavailable"
                    : item.seatsRemaining === 0 ? "Waitlist"
                    : item.seatsRemaining === null ? "Seats available"
                    : `${item.seatsRemaining} seats`}
                </StatusBadge>
              </span>
            </li>)}
          </ul>
        </WorkspacePanel>}
        <WorkspacePanel title="Program" description="Offered through the hosting school's extended learning program.">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-muted-foreground">School</dt>
              <dd className="mt-1">{offering.siteName}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Program</dt>
              <dd className="mt-1">{offering.programName}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Season</dt>
              <dd className="mt-1">{offering.seasonName}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Dates</dt>
              <dd className="mt-1">{offering.startsOn} to {offering.endsOn}</dd></div>
          </dl>
        </WorkspacePanel>
      </>}
      rail={<WorkspacePanel title="How registration works">
        <ol className="list-decimal space-y-2 pl-4 text-sm text-muted-foreground">
          <li>Sign in as a guardian, or create a family account.</li>
          <li>Choose your child and acknowledge the participation permission.</li>
          <li>Submit the registration; the school confirms placement or waitlist.</li>
        </ol>
        <Link to="/guardian/enrichment"
          className="mt-4 inline-block rounded-lg border px-3 py-2 text-sm font-semibold">
          View details and register
        </Link>
      </WorkspacePanel>} />
  </PageFrame>;
}

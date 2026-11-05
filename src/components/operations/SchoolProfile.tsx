import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { getLaunchSiteConfiguration } from "@/modules/programs/site-configuration.functions";
import { EmptyState, PageFrame, RecordHeader, RecordLayout, StatCard, StatusBadge, secondaryActionClassName, type StatusTone } from "@/components/workspace";
import { plural } from "@/lib/format";

export type SchoolProfileSite = Awaited<ReturnType<typeof getLaunchSiteConfiguration>>;
export interface SchoolProfileData {
  site: SchoolProfileSite;
  organizationName: string | null;
  /** Sites in the active membership's scope; more than one adds a return link to the directory. */
  siteCount: number | null;
  /** Active program enrollments by program, or null when the authoritative count is unavailable. */
  activeStudents: Record<string, number> | null;
}

const programTones: Record<string, StatusTone> = {
  draft: "neutral", launching: "info", ready: "info", active: "success", paused: "attention", closed: "neutral",
};
const publicationTones: Record<string, StatusTone> = { published: "success", draft: "neutral", unconfigured: "neutral" };
const label = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");

/** Contact is serialized as generic JSON; read only the string fields the setup contact schema defines. */
function readContact(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const text = (key: string) => typeof item[key] === "string" ? item[key] : "";
  return text("displayName") ? { displayName: text("displayName"), email: text("email"), phone: text("phone") } : null;
}

function formatAddress(address: NonNullable<SchoolProfileSite["physicalLocation"]["value"]>) {
  return [address.street1, address.street2, [address.city, [address.state, address.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", "), address.country]
    .filter(Boolean) as string[];
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return <div className="grid gap-1 py-3 sm:grid-cols-3 sm:gap-4">
    <dt className="text-sm text-muted-foreground">{term}</dt>
    <dd className="text-sm sm:col-span-2">{children}</dd>
  </div>;
}

function ManageLink({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <li className="flex flex-wrap items-center justify-between gap-3 p-4">
    <div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>
    {children}
  </li>;
}

/**
 * The school's stable record: identity, location, contact, programs and links to the
 * workflows that own each part. It edits nothing itself; Site Today is the daily view.
 */
export function SchoolProfile({ data }: { data: SchoolProfileData }) {
  const { site, organizationName, siteCount, activeStudents } = data;
  const address = site.physicalLocation.value;
  const contact = readContact(site.contact.value);
  const setupSearch = { siteId: site.id, programId: site.programs[0]?.id };
  const totalStudents = activeStudents ? Object.values(activeStudents).reduce((sum, count) => sum + count, 0) : null;
  const publication = site.publication.status;
  const linkClass = "text-sm font-semibold underline";

  return <PageFrame>
    <RecordLayout header={<RecordHeader eyebrow="School profile" title={site.name}
      subtitle={[organizationName, site.timezone].filter(Boolean).join(" · ")}
      breadcrumbs={siteCount === null || siteCount > 1 ? <Link to="/sites" className="underline">All schools</Link> : undefined}
      actions={<Link to="/sites/$siteId" params={{ siteId: site.id }} className={secondaryActionClassName}>Open today</Link>} />}
    main={<>
    {siteCount === null && <p role="status" className="mb-4 border p-3 text-sm">The school directory is unavailable. The number of authorized schools could not be verified.</p>}
    <div className="grid gap-3 sm:grid-cols-3">
      <StatCard label="Programs" value={site.programs.length} />
      {totalStudents !== null && <StatCard label="Active students" value={totalStudents} />}
      <StatCard label="Active programs" value={site.programs.filter(program => program.status === "active").length} />
    </div>

    <section aria-labelledby="school-profile-about" className="mt-9">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="school-profile-about" className="text-lg font-semibold">About</h2>
        <Link to="/launch/school" search={setupSearch} className={linkClass}>Edit in school setup</Link>
      </div>
      <dl className="mt-3 divide-y border bg-card px-4">
        <Fact term="School name">{site.name}</Fact>
        {organizationName && <Fact term="Organization">{organizationName}</Fact>}
        <Fact term="Address">{address
          ? <address className="not-italic">{formatAddress(address).map(line => <span key={line} className="block">{line}</span>)}</address>
          : <span className="text-muted-foreground">{site.physicalLocation.configurationStatus === "missing" ? "No address recorded" : "Address needs review in school setup"}</span>}</Fact>
        <Fact term="Time zone">{site.timezone}</Fact>
        <Fact term="Contact">{contact
          ? <span className="block">{contact.displayName}{contact.email && <span className="block text-muted-foreground">{contact.email}</span>}{contact.phone && <span className="block text-muted-foreground">{contact.phone}</span>}</span>
          : <span className="text-muted-foreground">No contact recorded</span>}</Fact>
      </dl>
      {(address || contact) && <p className="mt-2 text-xs text-muted-foreground">
        Address and contact are as entered in school setup. They appear publicly only after website review.
      </p>}
    </section>

    <section aria-labelledby="school-profile-programs" className="mt-9">
      <h2 id="school-profile-programs" className="text-lg font-semibold">Programs <span className="font-normal text-muted-foreground">({site.programs.length})</span></h2>
      {site.programs.length
        ? <ul className="mt-3 divide-y border bg-card">{site.programs.map(program => <li key={program.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
          <div>
            <p className="text-sm font-semibold">{program.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {[label(program.type), program.gradeRange && `Grades ${program.gradeRange.min}–${program.gradeRange.max}`,
                activeStudents && plural(activeStudents[program.id] ?? 0, "active student")].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge tone={programTones[program.status] ?? "neutral"}>{label(program.status)}</StatusBadge>
            <Link to="/launch/school" search={{ siteId: site.id, programId: program.id }} className={linkClass} aria-label={`Open setup for ${program.name}`}>Setup</Link>
          </div>
        </li>)}</ul>
        : <EmptyState className="mt-3" title="No programs yet" description="Start a program in school setup to enroll students at this school." />}
    </section>

    <section aria-labelledby="school-profile-manage" className="mt-9">
      <h2 id="school-profile-manage" className="text-lg font-semibold">Manage this school</h2>
      <ul className="mt-3 divide-y border bg-card">
        <ManageLink title="School years" description="Terms, calendars, holidays and instructional schedules.">
          <Link to="/operations/school-years" search={{ siteId: site.id }} className={linkClass}>View school years</Link>
        </ManageLink>
        <ManageLink title="Public website" description={site.publication.canPublish
          ? "What families see before they apply."
          : "What families see before they apply. A site publisher manages it."}>
          <div className="flex items-center gap-3">
            <StatusBadge tone={publicationTones[publication] ?? "neutral"}>{publication === "unconfigured" ? "Not set up" : label(publication)}</StatusBadge>
            {site.publication.canPublish && <Link to="/sites/$siteId/publish" params={{ siteId: site.id }} className={linkClass}>Manage website</Link>}
          </div>
        </ManageLink>
        {site.publication.canPublish && <ManageLink title="Public address and contact" description="Approve the address and contact details shown publicly.">
          <Link to="/sites/$siteId/parent-information" params={{ siteId: site.id }} className={linkClass}>Review</Link>
        </ManageLink>}
      </ul>
    </section>
    </>} />
  </PageFrame>;
}

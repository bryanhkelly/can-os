import type { ReactNode } from "react";
import { Link, type AnyRouter, type LinkComponentProps, type LinkOptions } from "@tanstack/react-router";
import type { getSchoolProfile } from "@/modules/operations/school-profile.functions";
import type { getSchoolExperiences } from "@/modules/student-experience/school-experiences.functions";
import { LiveSchoolExperiences, type SchoolExperienceSection } from "@/components/student/LiveSchoolExperiences";
import { DetailNavigation, EmptyState, SectionTab, StatCard, StatusBadge, WorkspacePanel, WorkspaceShell, secondaryActionClassName, type StatusTone } from "@/components/workspace";
import { plural } from "@/lib/format";

export type SchoolProfileSite = NonNullable<Awaited<ReturnType<typeof getSchoolProfile>>>;
export type SchoolExperiencesData = Awaited<ReturnType<typeof getSchoolExperiences>>;

export const schoolRecordTabs = [
  { value: "overview", label: "Overview" },
  { value: "calendar", label: "Calendar" },
  { value: "announcements", label: "Announcements" },
  { value: "conferences", label: "Teacher conferences" },
] as const;
export type SchoolRecordTab = (typeof schoolRecordTabs)[number]["value"];

export interface SchoolProfileData {
  site: SchoolProfileSite;
  /** Registrar-directory size; read only for school managers, null when that read fails. */
  siteCount: number | null;
  /** Live school-life sections; null when the viewer's role has no experiences read. */
  experiences: SchoolExperiencesData | null;
}

const programTones: Record<string, StatusTone> = {
  draft: "neutral", launching: "info", ready: "info", active: "success", paused: "attention", closed: "neutral",
};
const publicationTones: Record<string, StatusTone> = { published: "success", draft: "neutral", unconfigured: "neutral" };
const label = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");

function schoolInitials(name: string) {
  return name.split(/\s+/).filter(word => /^[A-Za-z]/.test(word)).slice(0, 2).map(word => word[0]!.toUpperCase()).join("") || "S";
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
 * The one school record every member opens: identity, school-life sections
 * (calendar, announcements, conferences), facts (address, contact, programs with
 * authoritative enrollment) and links to the workflows that own each part.
 * It renders identically at /sites/$siteId/profile, /student/my-school and
 * /guardian/experiences; only the server-confirmed secured modules differ.
 * It edits nothing itself; Site Today is the daily view.
 */
export function SchoolProfile({ data, tab = "overview", tabLink }: {
  data: SchoolProfileData;
  tab?: SchoolRecordTab;
  /** Route-local tab targets, because the same record renders on several routes. */
  tabLink?: (tab: SchoolRecordTab) => LinkOptions & { to: string };
}) {
  const { site, siteCount, experiences } = data;
  const { canManageSchool, canPublish, canOpenSiteToday } = site.viewer;
  const address = site.physicalLocation.value;
  const contact = site.contact.value;
  const schoolImage = site.brand?.image;
  const setupSearch = { siteId: site.id, programId: site.programs[0]?.id };
  const totalStudents = site.programs.reduce((sum, program) => sum + program.activeStudents, 0);
  const publication = site.publication.status;
  const linkClass = "text-sm font-semibold underline";
  const showTabs = Boolean(experiences && tabLink);
  const moreLink = tabLink ? (section: SchoolExperienceSection, total: number) =>
    <Link {...tabLink(section)} className="inline-block text-sm font-semibold underline">
      View all {total} {schoolRecordTabs.find(item => item.value === section)!.label.toLowerCase()}</Link> : undefined;

  return <WorkspaceShell width="wide" eyebrow="School profile" title={site.name}
    subtitle={[site.organization.name, site.timezone].filter(Boolean).join(" · ")}
    breadcrumbs={canManageSchool && (siteCount === null || siteCount > 1) ? <Link to="/sites" className="underline">All schools</Link> : undefined}
    actions={<div className="flex items-start gap-4">
      {canOpenSiteToday && <Link to="/sites/$siteId" params={{ siteId: site.id }} className={secondaryActionClassName}>Open today</Link>}
      {experiences && (experiences.connected
        ? <StatusBadge tone="success">School updates connected</StatusBadge>
        : <StatusBadge tone="attention">School updates unavailable</StatusBadge>)}
      <span aria-hidden="true" data-school-mark="" className="grid size-16 shrink-0 place-items-center rounded-lg border bg-muted font-serif text-2xl text-muted-foreground"
        style={site.brand ? { backgroundColor: site.brand.theme.ink, color: site.brand.theme.onDark, fontFamily: site.brand.theme.displayFont } : undefined}>
        {site.brand?.logo ? <img src={site.brand.logo.src} alt="" width={64} height={64} className="size-16 object-contain" /> : schoolInitials(site.name)}
      </span>
    </div>}
    rail={<WorkspacePanel title="At school">
      <ul className="space-y-2 text-sm">
        {experiences?.viewerRole === "student" && <>
          <li><Link to="/student/courses" className="underline">My classes</Link></li>
          <li><Link to="/groups" className="underline">Study Groups</Link></li>
        </>}
        <li><Link to="/calendar" className="underline">Full school calendar</Link></li>
      </ul>
    </WorkspacePanel>}>
    {showTabs && <DetailNavigation label="School sections">{schoolRecordTabs.map(item =>
      <SectionTab key={item.value} current={tab === item.value}
        link={tabLink!(item.value) as LinkComponentProps<"a", AnyRouter, string, undefined, string, "">}>{item.label}</SectionTab>)}</DetailNavigation>}
    {tab !== "overview" ? (experiences?.connected
      ? <LiveSchoolExperiences data={experiences} view={tab} />
      : <EmptyState title="School experiences are temporarily unavailable" description="Your school calendar and announcements could not be loaded. Try again later." />)
    : <>
    {schoolImage && <img src={schoolImage.src} alt={schoolImage.altText}
      srcSet={"srcSet" in schoolImage ? schoolImage.srcSet : undefined} sizes="(max-width: 720px) calc(100vw - 40px), 1136px"
      width={"width" in schoolImage ? schoolImage.width : undefined} height={"height" in schoolImage ? schoolImage.height : undefined}
      decoding="async" fetchPriority="high"
      className="mb-6 aspect-[4/1] w-full rounded-lg object-cover" />}
    {canManageSchool && siteCount === null && <p role="status" className="mb-4 border p-3 text-sm">The school directory is unavailable. The number of authorized schools could not be verified.</p>}
    <div className="grid gap-3 sm:grid-cols-3">
      <StatCard label="Programs" value={site.programs.length} />
      <StatCard label="Active students" value={totalStudents} />
      <StatCard label="Active programs" value={site.programs.filter(program => program.status === "active").length} />
    </div>

    {experiences && (experiences.connected
      ? <div className="mt-9"><LiveSchoolExperiences data={experiences} view="overview" moreLink={moreLink} /></div>
      : <EmptyState className="mt-9" title="School experiences are temporarily unavailable" description="Your school calendar and announcements could not be loaded. Try again later." />)}

    <section aria-labelledby="school-profile-about" className="mt-9">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="school-profile-about" className="text-lg font-semibold">About</h2>
        {canManageSchool && <Link to="/launch/school" search={setupSearch} className={linkClass}>Edit in school setup</Link>}
      </div>
      <dl className="mt-3 divide-y border bg-card px-4">
        <Fact term="School name">{site.name}</Fact>
        <Fact term="School website">{site.publication.url
          ? <a href={site.publication.url} target="_blank" rel="noopener noreferrer" className="break-all underline">{site.publication.url}</a>
          : <span className="text-muted-foreground">Website not published</span>}</Fact>
        {site.organization.name && <Fact term="Organization">{site.organization.name}</Fact>}
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
                plural(program.activeStudents, "active student")].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge tone={programTones[program.status] ?? "neutral"}>{label(program.status)}</StatusBadge>
            {canManageSchool && <Link to="/launch/school" search={{ siteId: site.id, programId: program.id }} className={linkClass} aria-label={`Open setup for ${program.name}`}>Setup</Link>}
          </div>
        </li>)}</ul>
        : <EmptyState className="mt-3" title="No programs yet" description="Programs appear here once the school starts them in school setup." />}
    </section>

    {(canManageSchool || canPublish) && <section aria-labelledby="school-profile-manage" className="mt-9">
      <h2 id="school-profile-manage" className="text-lg font-semibold">Manage this school</h2>
      <ul className="mt-3 divide-y border bg-card">
        {canManageSchool && <ManageLink title="School years" description="Terms, calendars, holidays and instructional schedules.">
          <Link to="/operations/school-years" search={{ siteId: site.id }} className={linkClass}>View school years</Link>
        </ManageLink>}
        <ManageLink title="Public website" description={canPublish
          ? "What families see before they apply."
          : "What families see before they apply. A site publisher manages it."}>
          <div className="flex items-center gap-3">
            <StatusBadge tone={publicationTones[publication] ?? "neutral"}>{publication === "unconfigured" ? "Not set up" : label(publication)}</StatusBadge>
            {canPublish && <Link to="/sites/$siteId/publish" params={{ siteId: site.id }} className={linkClass}>Manage website</Link>}
          </div>
        </ManageLink>
        {canPublish && <ManageLink title="Public address and contact" description="Approve the address and contact details shown publicly.">
          <Link to="/sites/$siteId/parent-information" params={{ siteId: site.id }} className={linkClass}>Review</Link>
        </ManageLink>}
      </ul>
    </section>}
    </>}
  </WorkspaceShell>;
}

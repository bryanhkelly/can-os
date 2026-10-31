import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { isPublicSiteSlug, publicSiteHost } from "@/domain/public-site-address";
import { getSitePublicationDraftView, reserveSitePublicationAddress, setSitePublicationStatus, verifySitePublicationReachability } from "@/modules/sites/site-publication.functions";
import { AcademicProgramMarketingEditor } from "@/components/sites/AcademicProgramMarketingEditor";

export const Route = createFileRoute("/sites/$siteId/publish")({
  loader: ({ params }) => safeLoader(
    () => getSitePublicationDraftView({ data: { siteId: params.siteId } }),
    { authMessage: "Only an explicitly authorized site publisher can manage this address." },
  )(),
  component: SitePublishPage,
});

function SitePublishPage() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) return <LoaderFailure eyebrow="CAN OS · Site publishing"
    title="Public site setup" outcome={outcome}/>;
  return <DraftPublisher data={outcome.data}/>;
}

function DraftPublisher({ data }: { data: Awaited<ReturnType<typeof getSitePublicationDraftView>> }) {
  const router = useRouter();
  const [slug, setSlug] = useState(data.address?.slug ??
    (isPublicSiteSlug(data.site.slug) ? data.site.slug : ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reason, setReason] = useState("");
  const [contentReviewed, setContentReviewed] = useState(false);
  const [reachability, setReachability] = useState<"live" | "unreachable" | "hosting_disabled" | "not_published" | null>(null);
  const [verifying, setVerifying] = useState(false);

  async function reserve(event: FormEvent) {
    event.preventDefault();
    setError(""); setNotice(""); setSaving(true);
    try {
      await reserveSitePublicationAddress({ data: { siteId: data.site.id, slug } });
      await router.invalidate();
      setNotice("Address reserved. Your site remains private; nothing has been published.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not reserve this address.");
    } finally {
      setSaving(false);
    }
  }

  async function updatePublication(action: "publish" | "unpublish") {
    if (!data.address) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await setSitePublicationStatus({ data: {
        siteId: data.site.id, action, expectedRevision: data.address.updatedAt,
        reason, contentReviewed: action === "publish" && contentReviewed,
      } });
      setNotice(result.changed
        ? (action === "publish"
            ? (data.hostingConfigured
                 ? "Catalog approved. Hosting is configured; verify DNS/TLS and public reachability before announcing the URL."
                 : "Catalog approved. Hosting is disabled until the production hostname and routing configuration is enabled.")
            : "Site catalog unpublished and no longer publicly readable.")
        : "No change was needed. The site is already in that state.");
      setReason(""); setContentReviewed(false);
      await router.invalidate();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to change publication.");
    } finally {
      setSaving(false);
    }
  }

  async function verifyPublicWebsite() {
    setVerifying(true); setError("");
    try {
      const result = await verifySitePublicationReachability({ data: { siteId: data.site.id } });
      setReachability(result.status);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to check the public address");
      setReachability("unreachable");
    } finally { setVerifying(false); }
  }

  const hasApprovedPublicContent = data.catalogPreview.length > 0 ||
    data.academicPrograms.some(program => program.marketing?.status === "published" &&
      !["paused", "closed"].includes(program.status));
  const candidate = isPublicSiteSlug(slug) ? publicSiteHost(slug) : null;
  return <WorkspaceShell eyebrow="CAN OS · Site publishing" title={data.site.name + " · public site"}
    subtitle="Reserve and publish your school address. Public hosting depends on separate DNS, TLS and deployment configuration."
    breadcrumbs={<><Link to="/sites/$siteId" params={{ siteId: data.site.id }} className="underline">Site Today</Link><span>/</span><span>Public site</span></>}>
    {error && <p role="alert" className="mt-5 rounded-lg border border-red-500 p-3 text-sm">{error}</p>}
    {notice && <p role="status" className="mt-5 rounded-lg border p-3 text-sm">{notice}</p>}
    <section className="mt-6 rounded-xl border bg-card p-5">
      <h2 className="text-xl font-semibold">Public address</h2>
      <p className="mt-2 text-sm text-muted-foreground">Addresses must be globally unique. Reserving one does not activate DNS, allow public access, or open applications.</p>
      {data.address ? <div className="mt-4 space-y-2">
        <p className="font-medium">{data.address.host}</p>
        <p className="text-sm text-muted-foreground">Recorded status: {data.address.status}. {data.address.publishedAt
          ? "Approved " + new Date(data.address.publishedAt).toLocaleString()
          : "Not published"}. Address changes require separate approval.</p>
        {data.address.status === "published" && <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" disabled={verifying || saving} onClick={() => void verifyPublicWebsite()}
            className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50">
            {verifying ? "Checking HTTPS site…" : "Check live website"}
          </button>
          {reachability === "live" &&
            <a href={"https://" + data.address.host + "/"} target="_blank" rel="noopener noreferrer"
              className="text-sm font-semibold underline">Open verified live website</a>}
          {reachability && <p role="status" className="text-sm">
            {reachability === "live" ? "Public HTTPS website is reachable and serving CAN OS."
             : reachability === "hosting_disabled" ? "Hosting is disabled in this deployment."
             : reachability === "not_published" ? "Site publication is not approved."
             : "Public HTTPS website cannot yet be verified. Check DNS, TLS, and deployment routing."}
          </p>}
        </div>}
      </div> : <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={reserve}>
        <label className="flex-1 text-sm">Subdomain
          <input aria-label="Public site subdomain" className="mt-1 block w-full rounded-lg border bg-background p-2"
            value={slug} onChange={event => setSlug(event.target.value)} minLength={3} maxLength={48}
            required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="vineyard-academy"/>
        </label>
        <span className="pb-2 text-sm text-muted-foreground">.can-os.com</span>
        <button className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50"
          disabled={saving || !candidate} type="submit">{saving ? "Reserving…" : "Reserve address"}</button>
      </form>}
    </section>
    <section aria-labelledby="website-preview" className="mt-6 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="website-preview" className="text-xl font-semibold">Website draft preview</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This private, read-only preview uses the same website template and approved
            public-safe academic and enrichment listings as the eventual public site.
            Unapproved internal Programs are not displayed here. No inquiry forms,
            family applications or registrations are enabled.
          </p>
        </div>
        <span className="rounded-full border px-3 py-1 text-xs font-semibold">
          {data.address?.status === "published"
            ? (data.hostingConfigured ? "Published · hosting configured (DNS not verified)" : "Published · hosting disabled")
            : "Private draft"}
        </span>
      </div>
      {data.previewHtml ? <>
        <p className="mt-4 text-xs text-muted-foreground">
          Reserved address: <span className="font-mono">{data.address?.host}</span>.
          {data.hostingConfigured && data.address?.status === "published"
            ? "Hosting is enabled in the application; external DNS/TLS reachability must still be verified."
            : "This is a private preview, not an active public website."}
        </p>
        <iframe title={`${data.site.name} private website draft preview`}
          srcDoc={data.previewHtml} sandbox="" referrerPolicy="no-referrer"
          loading="lazy" className="mt-3 h-[680px] w-full rounded-lg border bg-white"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          The iframe is origin-isolated, and all form submission and scripts are disabled.
          Content approval and public hosting are separate operations.
        </p>
      </> : <p role="status" className="mt-4 rounded-lg border p-4 text-sm">
        Reserve a public address above to see the website draft. No content is public.
      </p>}
    </section>
    <section className="mt-6 rounded-xl border bg-card p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Internal program and catalog review · authenticated only</p>
      <div className="mt-5 border-b pb-5">
        <p className="font-serif text-3xl">{data.site.name}</p>
        <p className="mt-1 text-sm text-muted-foreground">{data.site.organizationName}</p>
        <p className="mt-2 text-sm text-muted-foreground">Proposed address: {data.address?.host ?? candidate ?? "Choose a valid address above"}</p>
      </div>
      <h2 className="mt-5 text-xl font-semibold">Programs at this site</h2>
      <p className="mt-2 text-sm text-muted-foreground">These are authorized internal program summaries, not public listings. No applications or registrations can be submitted here.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {data.programs.map(program => <article key={program.id} className="rounded-lg border p-4">
          <h3 className="font-medium">{program.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{program.type.replaceAll("_"," ")} · Grades {program.gradeRange.min}–{program.gradeRange.max}</p>
          <p className="mt-2 text-xs text-muted-foreground">Internal status: {program.status}. Not in the public enrichment catalog.</p>
        </article>)}
        {!data.programs.length && <p className="text-sm text-muted-foreground">No programs are currently available for this private preview.</p>}
      </div>
    </section>
    <section className="mt-6 rounded-xl border bg-card p-5">
      <h2 className="text-xl font-semibold">Enrichment catalog preview</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Existing independently published summer and after-school Seasons at this Site.
        Site approval controls catalog visibility only. It never changes
        registration availability or Program status.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {data.catalogPreview.map(item => <article key={item.seasonId} className="rounded-lg border p-4">
          <h3 className="font-semibold">{item.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {item.season} · {item.startsOn} to {item.endsOn}
          </p>
          <p className="mt-2 text-sm">
            {new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(
              (item.packages.length ? Math.min(...item.packages.map(pkg=>pkg.priceCents)) :
                item.feeAmountCents) / 100)}
            {item.packages.length ? " starting price" : ""}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {item.registrationOpen ? "CAN enrichment registration currently open" :
              "CAN enrichment registration window not open"}
            {" · "}{data.hostingConfigured ? "Hosting configured (check live website)" : "Public hosting disabled"}
          </p>
        </article>)}
        {!data.catalogPreview.length && <p className="text-sm text-muted-foreground">
          No eligible published enrichment Seasons for this site.
        </p>}
      </div>
    </section>
    <section className="mt-6 rounded-xl border bg-card p-5">
      <h2 className="text-xl font-semibold">Academic program marketing</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Approve individual school-year Programs for public discovery. Programs may
        be planned or launching: marketing approval does not open admissions or
        certify credit issuance, accreditation, or instructional readiness.
      </p>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {data.academicPrograms.map(program =>
          <AcademicProgramMarketingEditor
            key={program.id + (program.marketing?.updatedAt ?? "")}
            siteId={data.site.id} program={program}/>)}
        {!data.academicPrograms.length && <p className="text-sm text-muted-foreground">
          No academic Programs belong to your authorized scope at this Site.
        </p>}
      </div>
    </section>
    <section className="mt-6 rounded-xl border bg-card p-5">
      <h2 className="text-xl font-semibold">Site publication decision</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Approving this Site controls its public-safe enrichment catalog.
        It does not publish academic Programs or open registration.
        Deploying the public hostname remains a separate step.
      </p>
      {!data.address ? <p className="mt-4 text-sm">
        Reserve the Site address before approving its public catalog.
      </p> : <div className="mt-4 space-y-4">
        <p className="text-sm">Current state: <strong>{data.address.status}</strong></p>
        {data.address.status === "draft" && !hasApprovedPublicContent &&
          <p role="status" className="rounded-lg border p-3 text-sm">
            Publishing blocked: approve an academic Program listing or a summer / after-school
            enrichment offering first.
          </p>}
        <label className="block text-sm">
          Publication decision reason (10–500 characters; no student information)
          <textarea aria-label="Publication decision reason"
            className="mt-1 block w-full rounded-lg border bg-background p-2"
            value={reason} onChange={event => setReason(event.target.value)}
            minLength={10} maxLength={500} rows={3}
            placeholder={data.address.status === "published"
              ? "Reason for withdrawing this site catalog"
              : "What content was reviewed and approved?"}/>
        </label>
        {data.address.status === "draft" && <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={contentReviewed}
            onChange={event => setContentReviewed(event.target.checked)}/>
          <span>I reviewed this Site's identity and eligible enrichment offerings,
            including program titles, dates, pricing, and disclosures.</span>
        </label>}
        <button type="button"
          onClick={() => void updatePublication(data.address!.status === "published" ? "unpublish" : "publish")}
          disabled={saving || reason.trim().length < 10 ||
            (data.address.status === "draft" &&
              (!contentReviewed || !hasApprovedPublicContent))}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">
          {saving ? "Saving…" : data.address.status === "published"
            ? "Unpublish public catalog" : "Approve public catalog"}
        </button>
      </div>}
    </section>
  </WorkspaceShell>;
}

import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { isPublicSiteSlug, publicSiteHost } from "@/domain/public-site-address";
import { getSitePublicationDraftView, reserveSitePublicationAddress, setSitePublicationStatus } from "@/modules/sites/site-publication.functions";

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
            ? "Catalog approved. Public hostname routing is not yet active."
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

  const candidate = isPublicSiteSlug(slug) ? publicSiteHost(slug) : null;
  return <WorkspaceShell eyebrow="CAN OS · Site publishing" title={data.site.name + " · public site"}
    subtitle="Reserve an address and approve or withdraw the catalog. Public hostname routing is not yet active."
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
    <section className="mt-6 rounded-xl border bg-card p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Private editor preview · authenticated only</p>
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
        Existing published summer and after-school Seasons at this site. The Site's
        public website is still private. Preview does not open registration or
        publish any Program.
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
            {" · "}Public site hostname routing not yet active
          </p>
        </article>)}
        {!data.catalogPreview.length && <p className="text-sm text-muted-foreground">
          No eligible published enrichment Seasons for this site.
        </p>}
      </div>
    </section>
  </WorkspaceShell>;
}

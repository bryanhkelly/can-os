import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { emptySiteLocalContent, siteLocalContentLimits, type SiteLocalContent } from "@/domain/site-local-content";
import { WorkspaceShell } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { getPartnerWebsitePreviewView, publishChurchWebsiteContent, restoreChurchWebsiteContent } from "@/modules/sites/site-website-preview.functions";

export const Route = createFileRoute("/site-website")({
  loader: safeLoader(
    () => getPartnerWebsitePreviewView(),
    { authMessage: "This website preview requires a verified, Site-specific editor assignment." },
  ),
  component: PartnerSiteWebsitePage,
});

function PartnerSiteWebsitePage() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) return <LoaderFailure eyebrow="CAN OS · Partner website"
    title="Your Site website" outcome={outcome} />;

  const data = outcome.data;
  return <WorkspaceShell
    eyebrow="CAN OS · Church partner website"
    title={data.siteName + " · church website"}
    subtitle={data.organizationName + " · edit local content, review CAN-approved school listings"}>
    <section className="mt-6 rounded-xl border bg-card p-5">
      <h2 className="text-xl font-semibold">Your proposed Site address</h2>
      {data.host ? <>
        <p className="mt-3 font-mono text-sm">{data.host}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Site state: {data.status === "published" ? "Marketing approved" : "Private draft"}.
          The public hostname is not activated from this workspace.
        </p>
      </> : <p role="status" className="mt-3 text-sm">
        No public address is reserved for this Site. Ask your CAN launch registrar
        to finish website draft provisioning. You cannot reserve or publish
        addresses from this partner workspace.
      </p>}
      <p className="mt-3 text-sm text-muted-foreground">
        You may publish your church-owned descriptions and theological content without
        routine CAN approval. CAN remains responsible for the Site's institutional
        launch status, academic claims and admissions. This account cannot change
        those records or access student information.
      </p>
    </section>
    {data.host && <LocalWebsiteCopyEditor data={data} />}
    <section aria-labelledby="partner-preview-title" className="mt-6 rounded-xl border bg-card p-5">
      <h2 id="partner-preview-title" className="text-xl font-semibold">
        Private website preview
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        The same public-safe template used for the future Site website.
        Church-owned published copy can update without routine CAN approval;
        CAN-owned academic listings remain read-only.
        {data.approvedAcademicCount + data.approvedEnrichmentCount === 0
          ? " No program marketing listings have been approved yet." : ""}
      </p>
      {data.previewHtml ? <>
        <iframe
          title={data.siteName + " read-only website preview"}
          srcDoc={data.previewHtml}
          sandbox=""
          referrerPolicy="no-referrer"
          loading="lazy"
          className="mt-4 h-[700px] w-full rounded-lg border bg-white"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Scripts, form submission and same-origin access are disabled.
          Your Site draft is not a public enrollment or registration page.
        </p>
      </> : <p className="mt-4 rounded-lg border p-4 text-sm">
        Preview becomes available after the canonical Site receives a draft address.
      </p>}
    </section>
  </WorkspaceShell>;
}

const churchFields: ReadonlyArray<{ key: keyof SiteLocalContent; label: string; help: string; multi: boolean }> = [
  { key: "welcomeMessage", label: "Welcome", help: "A message from your local church.", multi: true },
  { key: "localDescription", label: "Local community and school vision", help: "Local vision, history, activities and community information; do not promise official academic services.", multi: true },
  { key: "denomination", label: "Denominational affiliation", help: "Describe your church's identity. Do not claim an endorsement that has not been granted.", multi: false },
  { key: "statementOfFaith", label: "Statement of faith", help: "Your church's own theological statement, not CAN's academic policies.", multi: true },
  { key: "spiritualFormation", label: "Spiritual formation", help: "Prayer, worship, discipleship, chapel or religious observances provided locally.", multi: true },
];

function LocalWebsiteCopyEditor({
  data,
}: { data: Awaited<ReturnType<typeof getPartnerWebsitePreviewView>> }) {
  const router = useRouter();
  const [content, setContent] = useState<SiteLocalContent>(
    data.editingContent ?? emptySiteLocalContent,
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    setContent(data.editingContent ?? emptySiteLocalContent);
  }, [data.currentRevision, data.editingContent]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await publishChurchWebsiteContent({
        data: { content, expectedRevision: data.currentRevision },
      });
      setNotice(result.status === "review_required"
        ? "Protected institutional language was held for CAN review. Previously published church content remains unchanged."
        : "Church content published. If this Site is publicly active, the new copy is available without separate CAN editorial approval.");
      await router.invalidate();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save church content.");
    } finally {
      setBusy(false);
    }
  }

  async function restore(revision: number) {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await restoreChurchWebsiteContent({
        data: { expectedRevision: data.currentRevision, restoreRevision: revision },
      });
      setNotice(result.status === "review_required"
        ? "Historical copy needs review under current claim rules; existing public content is unchanged."
        : `Revision ${revision} was restored as a new published revision.`);
      await router.invalidate();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to restore this revision.");
    } finally { setBusy(false); }
  }

  return <section aria-labelledby="local-copy-title" className="mt-6 rounded-xl border bg-card p-5">
    <h2 id="local-copy-title" className="text-xl font-semibold">Your church's website content</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      You control these fields. Local community, denominational and theological
      updates publish directly when basic safety checks pass, without CAN editorial
      approval. Official curriculum, admissions, tuition, accreditation and
      school-of-record information comes from CAN OS and cannot be edited here.
    </p>
    {data.localContentStatus === "review_required" && <p role="status" className="mt-3 rounded-lg border p-3 text-sm">
      Your latest proposed wording includes a protected claim. It is held for review;
      the last published church copy remains unchanged.
    </p>}
    {error && <p role="alert" className="mt-3 rounded-lg border p-3 text-sm">{error}</p>}
    {notice && <p role="status" className="mt-3 rounded-lg border p-3 text-sm">{notice}</p>}
    <form onSubmit={event => void submit(event)} className="mt-5 space-y-4">
      {churchFields.map(field => <label key={field.key} className="block text-sm">
        <span className="font-medium">{field.label}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{field.help}</span>
        {field.multi
          ? <textarea rows={field.key === "statementOfFaith" ? 6 : 3}
              maxLength={siteLocalContentLimits[field.key]}
              value={content[field.key]} onChange={e => setContent(old =>
                ({ ...old, [field.key]: e.target.value }))}
              className="mt-2 w-full rounded-lg border bg-background p-2 text-sm" />
          : <input type="text" maxLength={siteLocalContentLimits[field.key]}
              value={content[field.key]} onChange={e => setContent(old =>
                ({ ...old, [field.key]: e.target.value }))}
              className="mt-2 w-full rounded-lg border bg-background p-2 text-sm" />}
      </label>)}
      <button type="submit" disabled={busy}
        className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">
        {busy ? "Saving…" : "Publish church-owned content"}
      </button>
      <p className="text-xs text-muted-foreground">
        Revision {data.currentRevision}. HTML, embeds and media uploads are not supported.
        Student photographs, testimonials and social media links will receive separate
        consent and safety controls in later bites.
      </p>
    </form>
    {data.localHistory.length > 0 && <div className="mt-8 border-t pt-5">
      <h3 className="font-semibold">Version history and rollback</h3>
      <ul className="mt-3 space-y-2">
        {data.localHistory.map(version => <li key={version.revision}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
          <span>Revision {version.revision} · {version.status === "published" ? "Published" : "Held for review"}
            {" · "}{new Date(version.createdAt).toLocaleString()}</span>
          {version.status === "published" && version.revision < data.currentRevision &&
            <button type="button" disabled={busy} onClick={() => void restore(version.revision)}
              className="rounded-lg border px-3 py-1 text-xs disabled:opacity-50">
              Restore as new revision
            </button>}
        </li>)}
      </ul>
    </div>}
  </section>;
}

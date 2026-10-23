import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { getPartnerWebsitePreviewView } from "@/modules/sites/site-website-preview.functions";

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
    title={data.siteName + " · website draft"}
    subtitle={data.organizationName + " · read-only review, not publication approval"}>
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
        This partner account cannot publish the website, approve academic claims,
        open admissions, access student records or change institutional operations.
        Protected decisions remain with the separately authorized institution.
      </p>
    </section>
    <section aria-labelledby="partner-preview-title" className="mt-6 rounded-xl border bg-card p-5">
      <h2 id="partner-preview-title" className="text-xl font-semibold">
        Private website preview
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        The same public-safe template used for the future Site website. Only
        approved academic listings and eligible enrichment offerings appear.
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

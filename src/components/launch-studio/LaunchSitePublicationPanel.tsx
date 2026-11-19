import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Globe2, ShieldCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WorkspaceNotice, WorkspacePanel, StatusBadge } from "@/components/workspace";
import { normalizeClientError } from "@/lib/client-error";
import { readLaunchSitePublication, reviewLaunchSiteWebsiteCopy } from "@/modules/sites/launch-site-publication.functions";
import { setSitePublicationStatus, verifySitePublicationReachability } from "@/modules/sites/site-publication.functions";

type Publication = Awaited<ReturnType<typeof readLaunchSitePublication>>;
type Reachability = Awaited<ReturnType<typeof verifySitePublicationReachability>>["status"];

/** Prepare orchestrates the existing Site publication command. Never infer
 * accreditation, approval to operate, or authority to enroll from this result.
 */
export function LaunchSitePublicationPanel({ siteId }: { siteId: string }) {
  const [state, setState] = useState<Publication | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reviewed, setReviewed] = useState(false);
  const [copyReviewed, setCopyReviewed] = useState(false);
  const [reason, setReason] = useState("");
  const [reachability, setReachability] = useState<Reachability | null>(null);
  const [checking, setChecking] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await readLaunchSitePublication({ data: { siteId } });
      if (current === requestId.current) setState(result);
    } catch (cause) {
      if (current === requestId.current) {
        setState(null);
        setError(normalizeClientError(cause,
          "Site publication status is unavailable or you do not have publishing permission.").message);
      }
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    void load();
    return () => { requestId.current += 1; };
  }, [load]);

  async function change(action: "publish" | "unpublish" | "republish") {
    if (!state?.address || !state.canPublishSite || busy ||
      reason.trim().length < 10 || reason.trim().length > 500) return;
    if (action !== "unpublish" && (!reviewed || !state.publishingPrerequisitesPresent ||
      state.latestWebsiteStatus === "draft" || state.latestWebsiteStatus === "review_required")) return;
    setBusy(true);
    setError(null);
    try {
      await setSitePublicationStatus({ data: {
        siteId,
        action,
        expectedRevision: state.address.revision,
        reason: reason.trim(),
        contentReviewed: action !== "unpublish" && reviewed,
      } });
      setReason("");
      setReviewed(false);
      setReachability(null);
      await load();
    } catch (cause) {
      setError(normalizeClientError(cause,
        "Publication was not changed. Review the Site and retry.").message);
    } finally { setBusy(false); }
  }

  async function reviewCopy() {
    if (!state?.canReviewWebsiteCopy || state.latestWebsiteStatus !== "draft" ||
      !copyReviewed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await reviewLaunchSiteWebsiteCopy({ data: {
        siteId, expectedRevision: state.latestWebsiteRevision, contentReviewed: true,
      } });
      setCopyReviewed(false);
      await load();
      if (result.status !== "published") {
        setError("The website copy contains protected claims that require independent review.");
      }
    } catch (cause) {
      setError(normalizeClientError(cause, "Website copy could not be approved.").message);
    } finally { setBusy(false); }
  }

  async function checkLive() {
    if (checking) return;
    setChecking(true);
    setError(null);
    try {
      const result = await verifySitePublicationReachability({ data: { siteId } });
      setReachability(result.status);
    } catch (cause) {
      setError(normalizeClientError(cause, "Public website reachability could not be checked.").message);
      setReachability(null);
    } finally { setChecking(false); }
  }

  return <WorkspacePanel title="Publish your Site website"
    description="This is the official public Site decision. Your shared preview, website publication and learner enrollment are independent.">
    {loading ? <p role="status" className="text-sm text-muted-foreground">Checking your Site publication authorization…</p>
      : state ? <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3 border bg-background p-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold">{state.siteName}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {state.address ? state.address.host : "No official website address reserved"}
            </p>
          </div>
          <StatusBadge tone={state.address?.status === "published" ? "info" : "neutral"}>
            {state.address?.status === "published" ? "Publication recorded" : "Not published"}
          </StatusBadge>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="border p-3">
            <p className="text-xs font-semibold">Website content</p>
            <p className="mt-2 text-sm">{state.reviewedLocalContentAvailable ? "Approved local revision available" : "No approved local revision"}</p>
          </div>
          <div className="border p-3">
            <p className="text-xs font-semibold">Reviewed learning listings</p>
            <p className="mt-2 text-sm">{state.approvedAcademicCount} academic · {state.approvedEnrichmentCount} enrichment</p>
          </div>
          <div className="border p-3">
            <p className="text-xs font-semibold">Public hosting</p>
            <p className="mt-2 text-sm">{state.hostingConfigured ? "Configured · verify reachability" : "Not enabled in this deployment"}</p>
          </div>
        </div>
        {state.latestWebsiteStatus === "draft" && <section className="space-y-3 border p-4"
          aria-label="Approve saved website copy">
          <div>
            <h3 className="text-sm font-semibold">Review the latest website copy</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Website revision {state.latestWebsiteRevision} is still private.
              Review its claims, image rights, consent, and exact saved wording before submitting
              it through the existing protected-claim screening workflow.
              Approving local copy does not publish the Site.
            </p>
          </div>
          {state.canReviewWebsiteCopy ? <>
            <div className="flex items-start gap-3">
              <Checkbox id="site-copy-reviewed" checked={copyReviewed}
                onChange={event => setCopyReviewed(event.currentTarget.checked)} />
              <Label htmlFor="site-copy-reviewed" className="text-sm leading-6">
                I inspected the latest saved website content and confirmed it is appropriate
                for public review, including images and required consent.
              </Label>
            </div>
            <Button disabled={busy || !copyReviewed}
              onClick={() => void reviewCopy()} variant="outline">
              {busy ? "Reviewing copy…" : "Approve reviewed website copy"}
            </Button>
          </> : <WorkspaceNotice tone="attention">
            An authorized Site website editor must approve the local website copy.
          </WorkspaceNotice>}
        </section>}
        {state.latestWebsiteStatus === "review_required" && <WorkspaceNotice tone="attention">
          The newest website revision contains protected institutional claims awaiting independent
          review. Revise the copy in Website & Brand or complete the existing institutional review.
          Do not publish the Site based on an unresolved draft.
        </WorkspaceNotice>}
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link to="/launch/website" search={{ siteId, returnToHub: true }}>Review website design</Link>
          </Button>
          <Button asChild variant="outline">
            <a href={`/launch/site-preview?siteId=${encodeURIComponent(siteId)}`}
              target="_blank" rel="noopener noreferrer">Preview privately <ArrowUpRight className="size-4" /></a>
          </Button>
        </div>
        {!state.address ? <WorkspaceNotice tone="attention">
          Reserve the Site website address in Website & Brand before requesting official publication.
        </WorkspaceNotice> : <>
          {state.address.status === "published" ? <>
            <WorkspaceNotice tone="info">
              The public Site publication is recorded. This alone does not prove that the hostname is live,
              authorize institutional claims, approve an Offering or enable registration.
            </WorkspaceNotice>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" disabled={checking || busy} onClick={() => void checkLive()}>
                <Globe2 className="size-4" /> {checking ? "Checking…" : "Verify public website"}
              </Button>
              {reachability === "live" && <a className="text-sm font-semibold text-primary underline"
                href={`https://${state.address.host}/`} target="_blank" rel="noopener noreferrer">
                Open verified website <ArrowUpRight className="inline size-4" /></a>}
              {reachability && <p role="status" className="text-sm text-muted-foreground">
                {reachability === "live" ? "Public HTTPS website is reachable."
                  : reachability === "hosting_disabled" ? "Website hosting is disabled."
                  : reachability === "not_published" ? "Site publication is not active."
                  : "Public HTTPS reachability could not be verified."}
              </p>}
            </div>
          </> : (state.latestWebsiteStatus === "draft" || state.latestWebsiteStatus === "review_required")
          ? <WorkspaceNotice tone="attention">
            Finish reviewing or resolving the latest Site website revision before publishing
            the public Site. Existing approved listings remain separate from website copy.
          </WorkspaceNotice> : !state.publishingPrerequisitesPresent ? <WorkspaceNotice tone="attention">
            Official publication requires reviewed Site-owned content or at least one independently
            eligible academic or enrichment listing. Your design can still be privately previewed.
          </WorkspaceNotice> : <WorkspaceNotice tone="info">
            Publication requires an explicit review and recorded decision. It never publishes unpublished
            programs, establishes accreditation or turns on enrollment.
          </WorkspaceNotice>}
          {state.canPublishSite ? <div className="border-t pt-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="size-4 text-primary" />
              {state.address.status === "published" ? "Withdraw public publication" : "Review and publish"}
            </h3>
            <div className="mt-3 space-y-4">
              {(state.address.status !== "published" || state.canRepublish) && <div className="flex items-start gap-3">
                <Checkbox id="site-publication-reviewed" checked={reviewed}
                  onChange={event => setReviewed(event.currentTarget.checked)} />
                <Label htmlFor="site-publication-reviewed" className="text-sm leading-6">
                  I have reviewed the exact public-facing content, identity, images, and claims,
                  including consent and any required independent approval.
                </Label>
              </div>}
              <Field label="Decision reason" description="10–500 characters. This is recorded with the publication audit.">
                <Textarea value={reason} onChange={event => setReason(event.target.value)}
                  maxLength={500} rows={3} placeholder="Document what was reviewed and why this decision is appropriate." />
              </Field>
              {state.address.status==="published" && state.canRepublish && <div className="space-y-3 border bg-card p-4">
                <p className="text-sm font-semibold">A newer Site Brand or website revision is available</p>
                <p className="text-xs leading-5 text-muted-foreground">
                  The live website keeps its pinned version until you deliberately republish.
                  The latest saved version needs an explicit review and approval.
                  This does not open enrollment.
                </p>
                <Button type="button" disabled={busy||!reviewed||reason.trim().length<10 ||
                  !state.publishingPrerequisitesPresent ||
                  state.latestWebsiteStatus==="draft"||state.latestWebsiteStatus==="review_required"}
                  onClick={()=>void change("republish")}>
                  {busy?"Saving decision…":"Republish updated Site"}
                </Button>
              </div>}
              <Button disabled={busy || reason.trim().length < 10 ||
                (state.address.status !== "published" &&
                  (!reviewed || !state.publishingPrerequisitesPresent ||
                   state.latestWebsiteStatus === "draft" || state.latestWebsiteStatus === "review_required"))}
                variant={state.address.status === "published" ? "outline" : "default"}
                onClick={() => void change(state.address!.status === "published" ? "unpublish" : "publish")}>
                {busy ? "Saving decision…" : state.address.status === "published" ? "Unpublish Site" : "Publish Site website"}
              </Button>
            </div>
          </div> : <WorkspaceNotice tone="attention">
            Only the separately appointed Site publisher can make the official
            publication decision. Your website editing permission does not grant it.
          </WorkspaceNotice>}
        </>}
      </div> : <WorkspaceNotice tone="attention">
        {error ?? "The Site publication information could not be retrieved."}
        <div className="mt-3"><Button variant="outline" onClick={() => void load()}>Try again</Button></div>
      </WorkspaceNotice>}
    {state && error && <WorkspaceNotice tone="danger" className="mt-4">{error}</WorkspaceNotice>}
  </WorkspacePanel>;
}

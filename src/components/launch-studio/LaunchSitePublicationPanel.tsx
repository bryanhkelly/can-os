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
  const [publicationSnapshot, setPublicationSnapshot] = useState<{
    siteId: string; value: Publication;
  } | null>(null);
  // A site switch must hide the previous site's publication claims even
  // during the render before the new load effect executes.
  const state = publicationSnapshot?.siteId === siteId
    ? publicationSnapshot.value : null;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reviewed, setReviewed] = useState(false);
  const [copyReviewed, setCopyReviewed] = useState(false);
  const [reason, setReason] = useState("");
  const [reachability, setReachability] = useState<Reachability | null>(null);
  const [checking, setChecking] = useState(false);
  const requestId = useRef(0);
  const reachabilityRequestId = useRef(0);
  const activeSiteId = useRef(siteId);

  const load = useCallback(async (propagateFailure = false) => {
    if (activeSiteId.current !== siteId) {
      if (propagateFailure) throw new Error("Publication context changed. Reload this Site.");
      return;
    }
    const current = ++requestId.current;
    setLoading(true);
    setError(null);
    setPublicationSnapshot(null);
    try {
      const result = await readLaunchSitePublication({ data: { siteId } });
      if (result.siteId !== siteId)
        throw new Error("The Site publication reader returned an unexpected Site.");
      if (current !== requestId.current || activeSiteId.current !== siteId) {
        if (propagateFailure) throw new Error("Publication context changed. Reload this Site.");
        return;
      }
      setPublicationSnapshot({ siteId, value: result });
    } catch (cause) {
      if (current === requestId.current && activeSiteId.current === siteId) {
        setPublicationSnapshot(null);
        setError(normalizeClientError(cause,
          "Site publication status is unavailable or you do not have publishing permission.").message);
      }
      // A completed publication command must not be treated as verified if
      // this authoritative refresh fails or its Site context has changed.
      if (propagateFailure) throw cause;
    } finally {
      if (current === requestId.current && activeSiteId.current === siteId)
        setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    activeSiteId.current = siteId;
    setReviewed(false);
    setCopyReviewed(false);
    setReason("");
    setReachability(null);
    setChecking(false);
    setError(null);
    reachabilityRequestId.current += 1;
    void load();
    return () => {
      requestId.current += 1;
      reachabilityRequestId.current += 1;
    };
  }, [load, siteId]);

  async function change(action: "publish" | "unpublish" | "republish") {
    if (!state?.address || !state.canPublishSite || busy ||
      reason.trim().length < 10 || reason.trim().length > 500) return;
    if (action !== "unpublish" && (!reviewed || !state.publishingPrerequisitesPresent ||
      state.latestWebsiteStatus === "draft" || state.latestWebsiteStatus === "review_required")) return;
    setBusy(true);
    setError(null);
    let commandAccepted = false;
    try {
      await setSitePublicationStatus({ data: {
        siteId,
        action,
        expectedRevision: state.address.revision,
        reason: reason.trim(),
        contentReviewed: action !== "unpublish" && reviewed,
      } });
      commandAccepted = true;
      if (activeSiteId.current !== siteId) return;
      setReason("");
      setReviewed(false);
      setReachability(null);
      await load(true);
    } catch (cause) {
      if (activeSiteId.current === siteId) {
        // A rejected transport response might still represent a committed
        // publication change. Do not expose another write until reconciled.
        setPublicationSnapshot(null);
        setError(commandAccepted
          ? "The publication decision was saved, but the current Site state could not be verified. Reload and reconcile before any further publication action."
          : normalizeClientError(cause,
            "Publication could not be confirmed. Reload the Site before retrying.").message);
      }
    } finally { setBusy(false); }
  }

  async function reviewCopy() {
    if (!state?.canReviewWebsiteCopy || state.latestWebsiteStatus !== "draft" ||
      !copyReviewed || busy) return;
    setBusy(true);
    setError(null);
    let commandAccepted = false;
    try {
      const result = await reviewLaunchSiteWebsiteCopy({ data: {
        siteId, expectedRevision: state.latestWebsiteRevision, contentReviewed: true,
      } });
      commandAccepted = true;
      if (activeSiteId.current !== siteId) return;
      setCopyReviewed(false);
      await load(true);
      if (result.status !== "published") {
        setError("The website copy contains protected claims that require independent review.");
      }
    } catch (cause) {
      if (activeSiteId.current === siteId) {
        setPublicationSnapshot(null);
        setError(commandAccepted
          ? "The website copy review was saved, but its current status could not be verified. Reload and reconcile before taking another action."
          : normalizeClientError(cause,
            "Website copy review could not be confirmed. Reload the Site before retrying.").message);
      }
    } finally { setBusy(false); }
  }

  async function checkLive() {
    if (checking || !state) return;
    const request = ++reachabilityRequestId.current;
    setChecking(true);
    setError(null);
    setReachability(null);
    try {
      const result = await verifySitePublicationReachability({ data: { siteId } });
      if (request === reachabilityRequestId.current && activeSiteId.current === siteId)
        setReachability(result.status);
    } catch (cause) {
      if (request === reachabilityRequestId.current && activeSiteId.current === siteId) {
        setError(normalizeClientError(cause, "Public website reachability could not be checked.").message);
        setReachability(null);
      }
    } finally {
      if (request === reachabilityRequestId.current && activeSiteId.current === siteId)
        setChecking(false);
    }
  }

  return <WorkspacePanel title="Publish your website"
    description="Review your website and make sure its words, photos, and important details are ready. Publishing your website is separate from opening registration.">
    {loading || (publicationSnapshot !== null && publicationSnapshot.siteId !== siteId)
      ? <p role="status" className="text-sm text-muted-foreground">Checking your website's publication status…</p>
      : state ? <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3 border bg-background p-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold">{state.siteName}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {state.address ? state.address.host : "Website address not yet chosen"}
            </p>
          </div>
          <StatusBadge tone={state.address?.status === "published" ? "info" : "neutral"}>
            {state.address?.status === "published" ? "Published" : "Not published"}
          </StatusBadge>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="border p-3">
            <p className="text-xs font-semibold">Website content</p>
            <p className="mt-2 text-sm">{state.reviewedLocalContentAvailable ? "Reviewed content ready" : "Website content needs review"}</p>
          </div>
          <div className="border p-3">
            <p className="text-xs font-semibold">Approved program listings</p>
            <p className="mt-2 text-sm">{state.approvedAcademicCount} academic · {state.approvedEnrichmentCount} enrichment</p>
          </div>
          <div className="border p-3">
            <p className="text-xs font-semibold">Public hosting</p>
            <p className="mt-2 text-sm">{state.hostingConfigured ? "Set up · check whether it's live" : "Not available yet"}</p>
          </div>
        </div>
        {state.latestWebsiteStatus === "draft" && <section className="space-y-3 border p-4"
          aria-label="Approve saved website copy">
          <div>
            <h3 className="text-sm font-semibold">Review your website content</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Your latest website draft is still private. Check the wording, photos,
              permissions, and any claims that need independent review before approving it.
              This step reviews the content; it doesn't publish your website.
            </p>
          </div>
          {state.canReviewWebsiteCopy ? <>
            <div className="flex items-start gap-3">
              <Checkbox id="site-copy-reviewed" checked={copyReviewed}
                onChange={event => setCopyReviewed(event.currentTarget.checked)} />
              <Label htmlFor="site-copy-reviewed" className="text-sm leading-6">
                I've reviewed the website wording, images, and permissions and am ready
                to submit this version for public review.
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
          Some statements in your latest website draft need independent review.
          Update them in Website & Brand or complete that review before publishing.
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
          Choose your website address in Website & Brand before publishing.
        </WorkspaceNotice> : <>
          {state.address.status === "published" ? <>
            <WorkspaceNotice tone="info">
              Your website is marked as published. Check that visitors can reach it below.
              Program approvals and registration are handled separately.
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
            Finish reviewing your latest website draft before publishing.
          </WorkspaceNotice> : !state.publishingPrerequisitesPresent ? <WorkspaceNotice tone="attention">
            Your website needs reviewed content or an eligible approved listing before it can be published.
            You can keep working on your private preview.
          </WorkspaceNotice> : <WorkspaceNotice tone="info">
            Review and confirm your decision to publish. Programs and registration need separate approval.
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
              <Field label="Decision reason" description="Explain why you're publishing, updating, or unpublishing this website (10–500 characters).">
                <Textarea value={reason} onChange={event => setReason(event.target.value)}
                  maxLength={500} rows={3} placeholder="Document what was reviewed and why this decision is appropriate." />
              </Field>
              {state.address.status==="published" && state.canRepublish && <div className="space-y-3 border bg-card p-4">
                <p className="text-sm font-semibold">A newer Site Brand or website revision is available</p>
                <p className="text-xs leading-5 text-muted-foreground">
                  Your live website stays unchanged until you approve and publish the newer version.
                  Review the latest changes before publishing.
                  Registration opens separately for each approved offering.
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
            An authorized site publisher must approve the
            publication decision. You can still prepare the website for their review.
          </WorkspaceNotice>}
        </>}
      </div> : <WorkspaceNotice tone="attention">
        {error ?? "We couldn't check your website's publication status."}
        <div className="mt-3"><Button variant="outline" onClick={() => void load()}>Try again</Button></div>
      </WorkspaceNotice>}
    {state && error && <WorkspaceNotice tone="danger" className="mt-4">{error}</WorkspaceNotice>}
  </WorkspacePanel>;
}

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { WorkspaceNotice } from "@/components/workspace";
import { normalizeClientError } from "@/lib/client-error";
import {
  createSitePreviewShare, listSitePreviewShares, revokeSitePreviewShare,
} from "@/modules/sites/site-preview-sharing.functions";

type Share = Awaited<ReturnType<typeof listSitePreviewShares>>[number];

/** Website design can be shared in Establish without a Site publication or
 * enrollment claim. One-time bearer URL is never rehydrated from storage.
 */
export function LaunchPreviewSharing({ siteId }: { siteId: string }) {
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState<Share[]>([]);
  const [expiresAfterDays, setExpiresAfterDays] = useState<7 | 30 | null>(7);
  const [createdUrl, setCreatedUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(null);
    void listSitePreviewShares({ data: { siteId } }).then(result => {
      if (active) setShares(result);
    }).catch(cause => {
      if (active) setError(normalizeClientError(cause,
        "Preview links cannot be loaded for this Site.").message);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, siteId]);

  async function create() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setCreatedUrl("");
    setCopied(false);
    try {
      const result = await createSitePreviewShare({ data: { siteId, expiresAfterDays } });
      const url = new URL(result.relativeUrl, window.location.origin);
      setCreatedUrl(url.toString());
      setShares(await listSitePreviewShares({ data: { siteId } }));
    } catch (cause) {
      setError(normalizeClientError(cause,
        "Could not create a public-safe website preview. Check the saved content and try again.").message);
    } finally { setBusy(false); }
  }

  async function revoke(shareId: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await revokeSitePreviewShare({ data: { siteId, shareId } });
      setShares(await listSitePreviewShares({ data: { siteId } }));
      setCreatedUrl("");
      setCopied(false);
    } catch (cause) {
      setError(normalizeClientError(cause, "Could not revoke this preview link.").message);
    } finally { setBusy(false); }
  }

  async function copy() {
    if (!createdUrl) return;
    try {
      await navigator.clipboard.writeText(createdUrl);
      setCopied(true);
    } catch {
      setError("Clipboard access is unavailable. Select the link below to copy it manually.");
    }
  }

  const activeShares = shares.filter(share => !share.revokedAt &&
    (!share.expiresAt || Date.parse(share.expiresAt) > Date.now()));
  return <>
    <Button type="button" variant="ghost" size="sm"
      className="gap-2" onClick={() => setOpen(true)}>
      <Share2 className="size-4" aria-hidden="true" /> Share preview
    </Button>
    <Modal open={open} onClose={() => setOpen(false)} label="Share Site website preview"
      className="max-w-2xl">
      <div className="flex items-start justify-between gap-4 border-b p-5">
        <div>
          <h2 className="font-serif text-xl">Share your website preview</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Invite leadership, families or partners to view the proposed website before official publication.
          </p>
        </div>
        <Button size="sm" variant="ghost" aria-label="Close sharing" onClick={() => setOpen(false)}>
          <X className="size-5" />
        </Button>
      </div>
      <div className="space-y-5 p-5">
        <WorkspaceNotice tone="info">
          Recipients do not need a CAN OS account. Links are unlisted but can be forwarded.
          The fixed snapshot excludes private Site Story answers, contacts, unconsented imagery,
          and unpublished institutional or enrollment claims. Sharing does not publish your Site.
        </WorkspaceNotice>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-44 flex-1 space-y-2">
            <Label htmlFor="website-preview-expiration">Link expiration</Label>
            <Select id="website-preview-expiration"
              value={expiresAfterDays === null ? "never" : String(expiresAfterDays)}
              disabled={busy} onChange={event => {
                const value = event.currentTarget.value;
                setExpiresAfterDays(value === "never" ? null : value === "30" ? 30 : 7);
              }}>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="never">No automatic expiration</option>
            </Select>
          </div>
          <Button type="button" disabled={busy || loading || activeShares.length >= 5}
            onClick={() => void create()}>
            {busy ? "Saving preview…" : "Create shareable preview"}
          </Button>
        </div>
        {createdUrl && <div className="border p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Check className="size-4 text-primary" /> View-only link created
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Copy this link now. The token cannot be retrieved again after you close this window.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Input readOnly aria-label="Created shareable website preview URL" value={createdUrl}
              onFocus={event => event.currentTarget.select()} className="min-w-0 flex-1" />
            <Button type="button" variant="outline" onClick={() => void copy()}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy link"}
            </Button>
            <Button asChild variant="outline">
              <a href={createdUrl} target="_blank" rel="noopener noreferrer">Open <ExternalLink className="size-4" /></a>
            </Button>
          </div>
        </div>}
        <div className="border-t pt-4">
          <h3 className="text-sm font-semibold">Active preview links</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Up to five active links. Revoke any link to stop access to its frozen website snapshot.
          </p>
          {loading ? <p role="status" className="mt-3 text-sm">Loading preview links…</p>
            : activeShares.length ? <div className="mt-3 space-y-2">
              {activeShares.map(share => <div key={share.id}
                className="flex flex-wrap items-center justify-between gap-3 border p-3">
                <div>
                  <p className="text-sm font-medium">Website revision {share.sourceRevision || "starter"}</p>
                  <p className="text-xs text-muted-foreground">
                    Created {new Date(share.createdAt).toLocaleDateString()} ·
                    {share.expiresAt ? " Expires " + new Date(share.expiresAt).toLocaleDateString() : " No expiration"}
                  </p>
                </div>
                <Button size="sm" variant="outline" disabled={busy}
                  onClick={() => void revoke(share.id)}>Revoke</Button>
              </div>)}
            </div> : <p className="mt-3 text-sm text-muted-foreground">No active preview links.</p>}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
    </Modal>
  </>;
}

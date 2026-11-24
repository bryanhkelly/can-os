import { useEffect, useRef, useState } from "react";
import { Check, ExternalLink, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyLinkButton } from "@/components/links/CopyLinkButton";
import { GoLinkQrButton } from "@/components/links/GoLinkQrButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { WorkspaceNotice } from "@/components/workspace";
import { getCanonicalGoLinkShareOrigin } from "@/modules/engagement/go-link-share-origin.functions";
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
  const [createdCode,setCreatedCode]=useState<string|null>(null);
  const pending=useRef<{siteId:string;expires:7|30|null;id:string}|null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    // The raw bearer URL is intentionally shown only in this creation session.
    setCreatedUrl("");
    setCreatedCode(null);
  }

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(null);
    setShares([]);
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
    setCreatedCode(null);
    try {
      const origin=await getCanonicalGoLinkShareOrigin();
      const request=pending.current?.siteId===siteId&&pending.current.expires===expiresAfterDays?pending.current:{siteId,expires:expiresAfterDays,id:crypto.randomUUID()};
      pending.current=request;
      const result = await createSitePreviewShare({ data: { siteId, expiresAfterDays,requestId:request.id } });
      pending.current=null;
      setCreatedCode(result.relativeUrl.split("/").at(-1)??null);
      const url = new URL(result.relativeUrl, origin);
      setCreatedUrl(url.toString());
      // The share has already been committed. A failed list refresh must not\n      // masquerade as a failed creation or cause the operator to issue duplicates.\n      try {\n        setShares(await listSitePreviewShares({ data: { siteId } }));\n      } catch {\n        setError("Your link was created. The active links list could not be refreshed. Copy your link before closing.");\n      }\n    } catch (cause) {\n      setError(normalizeClientError(cause,\n        "Could not create the website preview. Your saved website has not been changed. Try again or contact platform support.").message);
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
      setCreatedCode(null);
    } catch (cause) {
      setError(normalizeClientError(cause, "Could not revoke this preview link.").message);
    } finally { setBusy(false); }
  }

  const activeShares = shares.filter(share => !share.revokedAt &&
    (!share.expiresAt || Date.parse(share.expiresAt) > Date.now()));
  return <>
    <Button type="button" variant="ghost" size="sm"
      className="gap-2" onClick={() => setOpen(true)}>
      <Share2 className="size-4" aria-hidden="true" /> Share preview
    </Button>
    <Modal open={open} onClose={close} label="Share Site website preview"
      dismissible={!busy} busy={busy} className="max-w-2xl">
      <div className="flex items-start justify-between gap-4 border-b p-5">
        <div>
          <h2 className="font-serif text-xl">Share your website preview</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Invite leadership, families or partners to view the proposed website before official publication.
          </p>
        </div>
        <Button size="sm" variant="ghost" aria-label="Close sharing" disabled={busy} onClick={close}>
          <X className="size-5" />
        </Button>
      </div>
      <div className="space-y-5 p-5">
        <WorkspaceNotice tone="info">
          Recipients do not need CAN OS accounts. They can explore the proposed website,
          including your saved Programs &amp; Audiences as clearly labeled plans, not enrollment offers.
          Links are unlisted but can be forwarded. Private Site Information answers, contacts,
          unconsented imagery and unapproved institutional claims are excluded.
          Sharing does not publish the Site.
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
            <Check className="size-4 text-success" aria-hidden="true" /> View-only link created
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Copy this Go Link now or retrieve it later from your active preview links.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Input readOnly aria-label="Created shareable website preview URL" value={createdUrl}
              onFocus={event => event.currentTarget.select()} className="min-w-0 flex-1" />
            {createdCode && <CopyLinkButton destination={{kind:"go",code:createdCode}}/>}
            {createdCode && <GoLinkQrButton key={createdCode} code={createdCode}/>}
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
                  <p className="text-sm font-medium">Website version {share.sourceRevision || "starter"}</p>
                  <p className="text-xs text-muted-foreground">
                    Created {new Date(share.createdAt).toLocaleDateString()} ·
                    {share.expiresAt ? " Expires " + new Date(share.expiresAt).toLocaleDateString() : " No expiration"}
                  </p>
                </div>
                <div className="flex gap-2">
                  {share.paused && <span className="text-xs">Paused</span>}
                  {share.code && <Button size="sm" variant="outline" disabled={busy} onClick={async()=>{
                    try{const origin=await getCanonicalGoLinkShareOrigin();setCreatedUrl(new URL("/go/"+share.code,origin).href);setCreatedCode(share.code);}catch{setError("Could not load the approved sharing origin.");}
                  }}>Show link</Button>}
                  <Button size="sm" variant="outline" disabled={busy}
                    onClick={() => void revoke(share.id)}>Revoke</Button>
                </div>
              </div>)}
            </div> : <p className="mt-3 text-sm text-muted-foreground">No active preview links.</p>}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
    </Modal>
  </>;
}

import { useEffect, useRef, useState } from "react";
import { Check, ExternalLink, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyLinkButton } from "@/components/links/CopyLinkButton";
import { GoLinkQrButton } from "@/components/links/GoLinkQrButton";
import { GoLinkActions, type GoLinkAction } from "@/components/links/GoLinkActions";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { ActionDialog, EmptyState, QueryState, StatusBadge, WorkspaceNotice } from "@/components/workspace";
import { getCanonicalGoLinkShareOrigin } from "@/modules/engagement/go-link-share-origin.functions";
import { normalizeClientError } from "@/lib/client-error";
import {
  createSitePreviewShare, listSitePreviewShares, revokeSitePreviewShare, setSitePreviewSharePaused,
} from "@/modules/sites/site-preview-sharing.functions";

type Share = Awaited<ReturnType<typeof listSitePreviewShares>>[number];

/** Website design can be shared in Establish without a Site publication or
 * enrollment claim. Authorized operators may retrieve saved Go codes.
 */
export function LaunchPreviewSharing({ siteId }: { siteId: string }) {
  return <LaunchPreviewSharingSession key={siteId} siteId={siteId}/>;
}
function LaunchPreviewSharingSession({ siteId }: { siteId: string }) {
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState<Share[]>([]);
  const [expiresAfterDays, setExpiresAfterDays] = useState<7 | 30 | null>(7);
  const [createdUrl, setCreatedUrl] = useState("");
  const [createdCode,setCreatedCode]=useState<string|null>(null);
  const pending=useRef<{siteId:string;expires:7|30|null;id:string}|null>(null);
  const [operation, setOperation] = useState<"create"|"change"|null>(null);
  const busy = operation !== null;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setRevokeTarget(null);
    // Clear transient selection; saved Go codes remain in the authorized inventory.
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
    setOperation("create");
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
      // The share has already been committed. A failed list refresh must not
      // masquerade as a failed creation or cause the operator to issue duplicates.
      try {
        setShares(await listSitePreviewShares({ data: { siteId } }));
      } catch {
        setError("Your link was created. The active links list could not be refreshed. Copy your link before closing.");
      }
    } catch (cause) {
      setError(normalizeClientError(cause,
        "Could not create the website preview. Your saved website has not been changed. Try again or contact platform support.").message);
    } finally { setOperation(null); }
  }

  async function change(shareId: string, action:GoLinkAction) {
    if (busy) return;
    setOperation("change");
    setError(null);
    try {
      if(action==="revoke")await revokeSitePreviewShare({ data: { siteId, shareId } });
      else await setSitePreviewSharePaused({data:{siteId,shareId,action}});
      setRevokeTarget(null);
      setCreatedUrl("");
      setCreatedCode(null);
      // Reflect the confirmed write even if the authoritative refresh fails.
      setShares(current=>action==="revoke"?current.filter(share=>share.id!==shareId):
        current.map(share=>share.id===shareId?{...share,paused:action==="pause"}:share));
      try {
        setShares(await listSitePreviewShares({ data: { siteId } }));
      } catch {
        setError("The preview link was updated, but the list could not be refreshed. Close and reopen sharing to refresh.");
      }
    } catch (cause) {
      setError(normalizeClientError(cause, "Could not change this preview link.").message);
    } finally { setOperation(null); }
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
          <Field label="Link expiration" className="min-w-44 flex-1">
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
          </Field>
          <Button type="button" disabled={busy || loading || activeShares.length >= 5}
            loading={operation==="create"} loadingLabel="Saving preview…" onClick={() => void create()}>
            Create shareable preview
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
          {loading ? <QueryState loading="Loading preview links…"/>
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
                <div className="space-y-2">
                  {share.paused && <StatusBadge tone="attention">Paused</StatusBadge>}
                  <GoLinkActions code={share.code} status={share.paused?"paused":"active"} busy={busy}
                    onShow={()=>void (async()=>{
                      try{const origin=await getCanonicalGoLinkShareOrigin();setCreatedUrl(new URL("/go/"+share.code,origin).href);setCreatedCode(share.code);}
                      catch{setError("Could not load the approved sharing origin.");}
                    })()}
                    onChange={action=>{if(action==="revoke"){setError(null);setRevokeTarget(share.id);}else void change(share.id,action);}}/>
                </div>
              </div>)}
            </div> : !error ? <EmptyState className="mt-3" title="No active preview links."/> : null}
        </div>
        {error && <WorkspaceNotice tone="danger">{error}</WorkspaceNotice>}
      </div>
    </Modal>
    <ActionDialog open={open&&!!revokeTarget} title="Revoke website preview permanently"
      description="Distributed copies will stop working. The saved website itself will not be changed."
      confirmLabel="Revoke preview" pending={busy} destructive
      confirmDisabled={!revokeTarget||!activeShares.some(share=>share.id===revokeTarget)}
      onClose={()=>setRevokeTarget(null)} onConfirm={()=>{if(revokeTarget)void change(revokeTarget,"revoke");}}>
      {error&&<WorkspaceNotice tone="danger">{error}</WorkspaceNotice>}
    </ActionDialog>
  </>;
}

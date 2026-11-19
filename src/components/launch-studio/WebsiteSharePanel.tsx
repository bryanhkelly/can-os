import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { WorkspaceNotice } from "@/components/workspace";
import {
  createWebsitePreviewShare, listWebsitePreviewShares, revokeWebsitePreviewShare,
} from "@/modules/sites/site-website-sharing.functions";

type ShareRow={id:string;revision:number;createdAt:string;expiresAt:string;revokedAt:string|null};

export function WebsiteSharePanel({siteId,revision,saved,enabled,canManage}:{
  siteId:string;revision:number;saved:boolean;enabled:boolean;canManage:boolean;
}) {
  const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [shareUrl,setShareUrl]=useState("");
  const [copied,setCopied]=useState(false);
  const [history,setHistory]=useState<ShareRow[]>([]);
  useEffect(()=>{
    if(!enabled || !canManage)return;
    let mounted=true;
    void listWebsitePreviewShares({data:{siteId}}).then(rows=>{
      if(mounted)setHistory(rows);
    }).catch(()=>{if(mounted)setError("Existing preview links could not be loaded.");});
    return ()=>{mounted=false;};
  },[siteId,enabled,canManage]);
  async function create() {
    if(busy || !confirmed || !saved || revision<1)return;
    setBusy(true);setError("");setCopied(false);
    try {
      const created=await createWebsitePreviewShare({data:{
        siteId,expectedRevision:revision,confirmedPublicSharing:true,
      }});
      setShareUrl(new URL(created.url,window.location.origin).href);
      setHistory(await listWebsitePreviewShares({data:{siteId}}));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create this shared preview.");
    } finally {setBusy(false);}
  }
  async function revoke(id:string) {
    if(busy || !window.confirm("Revoke this link? Viewers will lose access immediately."))return;
    setBusy(true);setError("");
    try {
      await revokeWebsitePreviewShare({data:{siteId,id}});
      setHistory(await listWebsitePreviewShares({data:{siteId}}));
      setShareUrl("");
      setConfirmed(false);
    } catch (e) {
      setError(e instanceof Error?e.message:"Unable to revoke this preview link.");
    } finally {setBusy(false);}
  }
  return <section className="space-y-4 border bg-card p-4 sm:p-5" aria-label="Share proposed website preview">
    <div>
      <h3 className="font-serif text-xl font-semibold">Share your website preview</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Show the proposed website to people outside CAN OS before your Site is approved.
        Share links show a fixed, reviewed design revision for seven days. They are not searchable
        through the Site catalog and cannot enable enrollment, applications or public publication.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Anyone with the link can view and forward it. Only share wording and photos intended for an external audience.
      </p>
    </div>
    {!enabled && <WorkspaceNotice tone="attention">
      Shared previews require website sharing migration 0088. Your private saved preview remains available.
    </WorkspaceNotice>}
    {!canManage && <WorkspaceNotice tone="attention">
      A Site administrator or authorized website editor must create and revoke share links.
    </WorkspaceNotice>}
    {enabled && canManage && <>
      <label className="flex items-start gap-3 border p-3 text-sm">
        <Checkbox checked={confirmed} disabled={busy}
          onChange={event=>setConfirmed(event.target.checked)} className="mt-1"/>
        <span>I reviewed the proposed website content and consented to sharing this saved version
          with people outside CAN OS. This is not official Site publication.</span>
      </label>
      {!saved && <p role="status" className="text-sm text-muted-foreground">
        Save your latest edits before creating a public-safe preview link.
      </p>}
      <Button type="button" disabled={busy || !confirmed || !saved || revision<1}
        loading={busy} loadingLabel="Creating preview…" onClick={()=>void create()}>
        Create shareable preview link
      </Button>
      {shareUrl && <div className="space-y-2 border p-3">
        <p className="text-xs font-semibold">Your new shareable link</p>
        <a href={shareUrl} target="_blank" rel="noopener noreferrer"
          className="block break-all text-sm text-primary underline">{shareUrl}</a>
        <Button type="button" variant="outline" onClick={()=>void navigator.clipboard.writeText(shareUrl)
          .then(()=>setCopied(true)).catch(()=>setError("Could not copy. Select and copy the URL above."))}>
          Copy link
        </Button>
        {copied && <p role="status" className="text-xs text-muted-foreground">Link copied.</p>}
        <p className="text-xs text-muted-foreground">
          Store this link now. For security, it cannot be recovered from the Site's link history.
        </p>
      </div>}
      {history.length>0 && <div className="space-y-2 border-t pt-4">
        <h4 className="text-sm font-semibold">Recent preview links</h4>
        <ul className="space-y-2">
          {history.map(item=>{
            const active=!item.revokedAt && new Date(item.expiresAt).getTime()>Date.now();
            return <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 border p-3 text-xs">
              <span>Revision {item.revision} · Created {new Date(item.createdAt).toLocaleDateString()}
                <span className="ml-2 font-semibold">{active?"Active":item.revokedAt?"Revoked":"Expired"}</span>
              </span>
              {active && <Button type="button" variant="outline" size="sm"
                disabled={busy} onClick={()=>void revoke(item.id)}>Revoke</Button>}
            </li>;
          })}
        </ul>
      </div>}
    </>}
    {error && <WorkspaceNotice tone="danger">{error}</WorkspaceNotice>}
  </section>;
}

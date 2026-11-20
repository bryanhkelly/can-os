import { Button } from "@/components/ui/button";
import { WorkspaceNotice } from "@/components/workspace";
import { WebsiteInformationChecklist, WebsiteSourceMappingPanel, WebsiteDesignChecklist } from "@/components/sites/WebsiteReadinessPanels";
import { WebsitePreviewPanel } from "@/components/sites/WebsitePreviewPanel";
import { LaunchPreviewSharing } from "./LaunchPreviewSharing";
import { privateWebsitePreviewUrl } from "@/domain/private-website-preview";
import type { SiteLocalContent } from "@/domain/site-local-content";
import type { getPartnerWebsitePreviewView, previewChurchWebsiteDraft } from "@/modules/sites/site-website-preview.functions";

type WebsitePreviewData=Awaited<ReturnType<typeof getPartnerWebsitePreviewView>>;
type DraftPreview=Awaited<ReturnType<typeof previewChurchWebsiteDraft>>;

/** The complete Site preview, including proposed Programs. No public-release
 * command is inferred by the presence of preview or sharing controls. */
export function WebsiteReviewStep({
  data,content,draftPreview,dirty,editorRevision,revisionConflict,busy,
  previewPending,previewError,shareMessage,allowPublication,
  onPreview,onShareMessage,onSubmit,onRestore,
}:{
  data:WebsitePreviewData;content:SiteLocalContent;
  draftPreview:{source:SiteLocalContent;rendered:DraftPreview}|null;
  dirty:boolean;editorRevision:number;revisionConflict:boolean;busy:boolean;
  previewPending:boolean;previewError:string;shareMessage:string;
  allowPublication:boolean;
  onPreview:()=>void;onShareMessage:(text:string)=>void;
  onSubmit:()=>void;onRestore:(revision:number)=>void;
}){
  return <div className="space-y-4">
    <div>
      <h3 className="text-lg font-semibold">Review your website</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Preview your pages. Family information and institutional approvals are managed separately.
      </p>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" disabled={previewPending} onClick={onPreview}
        className="min-h-11 border border-primary bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
        {previewPending?"Generating secure preview...":"Preview unsaved changes"}
      </Button>
      <a href={privateWebsitePreviewUrl(data.siteId)} target="_blank" rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center border border-primary px-4 py-2 text-sm font-semibold text-primary">
        {data.currentRevision===0?"Open full-page sample preview":"Open full-page preview"}
      </a>
      {data.currentRevision>0&&<Button type="button" variant="outline" className="min-h-11 border"
        onClick={()=>void navigator.clipboard.writeText(
          new URL(privateWebsitePreviewUrl(data.siteId),window.location.origin).href,
        ).then(()=>onShareMessage("Preview link copied. Reviewers must sign in with their own authorized Site account."))
          .catch(()=>onShareMessage("Copy the address from Open full-page preview; clipboard permission was unavailable."))}>
        Copy private preview link
      </Button>}
    </div>
    <p className="text-xs text-muted-foreground">
      This private full-page link requires CAN OS sign-in; use Share preview for external
      reviewers. It does not publish a draft.
      {data.currentRevision>0?" It shows the latest saved revision.":" Until the first save, it shows a sample, not unsaved edits."}
      {dirty?" You have unsaved edits; save them before sharing the latest design.":""}
    </p>
    {data.currentRevision===0&&<p className="border p-3 text-sm" role="status">
      No saved website draft exists yet. Sharing your customized design requires saving.
    </p>}
    {shareMessage&&<p role="status" className="border p-3 text-sm">{shareMessage}</p>}
    {previewError&&<WorkspaceNotice tone="danger">{previewError}</WorkspaceNotice>}
    <WebsitePreviewPanel data={data}
      draftPreview={draftPreview?.source===content?draftPreview.rendered:null}/>
    {!dirty&&editorRevision>0&&!revisionConflict
      ?<div className="flex flex-wrap items-center justify-between gap-3 border p-4">
          <div>
            <p className="text-sm font-semibold">Ready to show your proposed website?</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Share your proposed Site, including planned Programs, without publishing
              the Site or opening enrollment.
            </p>
          </div>
          <LaunchPreviewSharing siteId={data.siteId}/>
        </div>
      :<p role="status" className="border p-3 text-sm">
          Save your latest website edits before sharing a review link.
        </p>}
    <WebsiteSourceMappingPanel data={data}/>
    <details className="border p-4">
      <summary className="cursor-pointer text-sm font-semibold">Review family information readiness</summary>
      <div className="mt-4"><WebsiteInformationChecklist data={data}/></div>
    </details>
    <details className="border p-4">
      <summary className="cursor-pointer text-sm font-semibold">Review website content quality</summary>
      <div className="mt-4"><WebsiteDesignChecklist data={data}/></div>
    </details>
    {!data.canPublish&&<p role="status" className="border p-3 text-sm">
      You can preview this Site, but your current Site assignment does not include local website publishing.
    </p>}
    {allowPublication&&<Button type="button" variant="outline"
      disabled={busy||!data.canPublish||revisionConflict} onClick={onSubmit}>
      {busy?"Publishing…":"Publish reviewed church-owned content"}
    </Button>}
    {!allowPublication&&<p className="text-sm text-muted-foreground">
      Launch Studio saves a private draft. Official Site publication belongs in Prepare.
    </p>}
    <p className="text-xs text-muted-foreground">
      Revision {data.currentRevision}. Raw HTML, embeds, testimonials and social links
      are unsupported. CAN controls institutional information.
    </p>
    {data.localHistory.length>0&&<details className="border p-4">
      <summary className="cursor-pointer text-sm font-semibold">Version history and rollback</summary>
      <ul className="mt-3 space-y-2">
        {data.localHistory.map(version=><li key={version.revision}
          className="flex flex-wrap items-center justify-between gap-3 border p-3 text-sm">
          <span>Revision {version.revision} · {version.status==="published"?"Published":
            version.status==="draft"?"Private draft":"Held for review"}
            {" · "}{new Date(version.createdAt).toLocaleString()}</span>
          {allowPublication&&data.canPublish&&version.status==="published"&&
            version.revision<data.currentRevision&&
            <Button type="button" variant="outline" disabled={busy||revisionConflict}
              onClick={()=>onRestore(version.revision)} className="border px-3 py-1 text-xs">
              Restore as new revision
            </Button>}
        </li>)}
      </ul>
    </details>}
  </div>;
}

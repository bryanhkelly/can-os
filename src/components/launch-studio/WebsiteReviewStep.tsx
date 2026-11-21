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
    <h3 className="text-lg font-semibold">Review your website</h3>
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" disabled={previewPending} onClick={onPreview}
        size="lg">
        {previewPending?"Preparing preview...":"Preview changes"}
      </Button>
      <a href={privateWebsitePreviewUrl(data.siteId)} target="_blank" rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center border border-primary px-4 py-2 text-sm font-semibold text-primary">
        Open full-page preview
      </a>
      {data.currentRevision>0&&<Button type="button" variant="outline" className="min-h-11 border"
        onClick={()=>void navigator.clipboard.writeText(
          new URL(privateWebsitePreviewUrl(data.siteId),window.location.origin).href,
        ).then(()=>onShareMessage("Preview link copied. Reviewers must sign in with their own authorized Site account."))
          .catch(()=>onShareMessage("Copy the address from Open full-page preview; clipboard permission was unavailable."))}>
        Copy preview link
      </Button>}
    </div>
    <p className="text-xs text-muted-foreground">This preview requires sign-in. Use Share preview to send a link to others.</p>
    {data.currentRevision===0&&<p className="border p-3 text-sm" role="status">
      Save your website before sharing.
    </p>}
    {shareMessage&&<p role="status" className="border p-3 text-sm">{shareMessage}</p>}
    {previewError&&<WorkspaceNotice tone="danger">{previewError}</WorkspaceNotice>}
    <WebsitePreviewPanel data={data}
      draftPreview={draftPreview?.source===content?draftPreview.rendered:null}/>
    {!dirty&&editorRevision>0&&!revisionConflict
      ?<div className="flex flex-wrap items-center justify-between gap-3 border p-4">
          <p className="text-sm font-semibold">Share your website</p>
          <LaunchPreviewSharing siteId={data.siteId}/>
        </div>
      :<p role="status" className="border p-3 text-sm">
          Save your changes before sharing.
        </p>}
    <WebsiteSourceMappingPanel data={data}/>
    <details className="border p-4">
      <summary className="cursor-pointer text-sm font-semibold">Family information</summary>
      <div className="mt-4"><WebsiteInformationChecklist data={data}/></div>
    </details>
    <details className="border p-4">
      <summary className="cursor-pointer text-sm font-semibold">Content checks</summary>
      <div className="mt-4"><WebsiteDesignChecklist data={data}/></div>
    </details>
    {!data.canPublish&&<p role="status" className="border p-3 text-sm">
      You do not have permission to publish this website.
    </p>}
    {allowPublication&&<Button type="button" variant="outline"
      disabled={busy||!data.canPublish||revisionConflict} onClick={onSubmit}>
      {busy?"Publishing…":"Publish website"}
    </Button>}
    {!allowPublication&&<p className="text-sm text-muted-foreground">
      Publish your Site in Prepare.
    </p>}

    {data.localHistory.length>0&&<details className="border p-4">
      <summary className="cursor-pointer text-sm font-semibold">Version history</summary>
      <ul className="mt-3 space-y-2">
        {data.localHistory.map(version=><li key={version.revision}
          className="flex flex-wrap items-center justify-between gap-3 border p-3 text-sm">
          <span>Revision {version.revision} · {version.status==="published"?"Published":
            version.status==="draft"?"Private draft":"Held for review"}
            {" · "}{new Date(version.createdAt).toLocaleString()}</span>
          {allowPublication&&data.canPublish&&version.status==="published"&&
            version.revision<data.currentRevision&&
            <Button type="button" variant="outline" disabled={busy||revisionConflict}
              onClick={()=>onRestore(version.revision)} size="sm">
              Restore version
            </Button>}
        </li>)}
      </ul>
    </details>}
  </div>;
}

import { Button } from "@/components/ui/button";
import { ActionFooter, DisclosureSection, WorkspaceNotice } from "@/components/workspace";
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
    <ActionFooter layout="inline">
      <Button type="button" loading={previewPending} loadingLabel="Preparing preview…" onClick={onPreview}
        size="lg">
        Preview changes
      </Button>
      <Button asChild variant="outline" size="lg">
        <a href={privateWebsitePreviewUrl(data.siteId)} target="_blank" rel="noopener noreferrer">Open private preview</a>
      </Button>
      {data.currentRevision>0&&<Button type="button" variant="outline" className="min-h-11"
        onClick={()=>void navigator.clipboard.writeText(
          new URL(privateWebsitePreviewUrl(data.siteId),window.location.origin).href,
        ).then(()=>onShareMessage("Preview link copied. Reviewers must sign in with their own authorized Site account."))
          .catch(()=>onShareMessage("Copy the address from Open private preview; clipboard permission was unavailable."))}>
        Copy internal link
      </Button>}
    </ActionFooter>
    <p className="text-xs text-muted-foreground">Private preview requires sign-in. To send the website to external visitors, create a shareable preview below. No account is required.</p>
    {data.currentRevision===0&&<WorkspaceNotice tone="attention">Save your website before sharing.</WorkspaceNotice>}
    {shareMessage&&<WorkspaceNotice>{shareMessage}</WorkspaceNotice>}
    {previewError&&<WorkspaceNotice tone="danger">{previewError}</WorkspaceNotice>}
    <WebsitePreviewPanel data={data}
      draftPreview={draftPreview?.source===content?draftPreview.rendered:null}/>
    {!dirty&&editorRevision>0&&!revisionConflict
      ?<div className="flex flex-wrap items-center justify-between gap-3 border p-4">
          <p className="text-sm font-semibold">Share your website externally</p>
          <LaunchPreviewSharing siteId={data.siteId}/>
        </div>
      :<WorkspaceNotice tone="attention">Save your changes before sharing.</WorkspaceNotice>}
    <WebsiteSourceMappingPanel data={data}/>
    <DisclosureSection title="Family information"><WebsiteInformationChecklist data={data}/></DisclosureSection>
    <DisclosureSection title="Content checks"><WebsiteDesignChecklist data={data}/></DisclosureSection>
    {!data.canPublish&&<WorkspaceNotice tone="attention">You do not have permission to publish this website.</WorkspaceNotice>}
    {allowPublication&&<Button type="button" variant="outline"
      disabled={busy||!data.canPublish||revisionConflict} onClick={onSubmit} loading={busy} loadingLabel="Publishing…">
      Publish website
    </Button>}
    {!allowPublication&&<p className="text-sm text-muted-foreground">
      Publish your Site in Prepare.
    </p>}

    {data.localHistory.length>0&&<DisclosureSection title="Version history">
      <ul className="space-y-2">
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
    </DisclosureSection>}
  </div>;
}

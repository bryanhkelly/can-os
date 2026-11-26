import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkspaceNotice, WorkspacePanel, DisclosureSection, EmptyState, QueryState, ActionFooter } from "@/components/workspace";
import { marketingFormatOptions, type MarketingFormat } from "@/domain/marketing-package-v61";
import { packageReleaseIsDownloadableV61 } from "@/domain/marketing-package-release-v61";
import { MarketingMaterialPreviewV61 } from "./MarketingMaterialPreviewV61";
import type { listSiteMarketingPackagesV61 } from "@/modules/programs/site-marketing-packages-v61.functions";
import type {
  listSiteMarketingPackageReleases, listSiteMarketingReleases,
} from "@/modules/programs/site-marketing-artifacts.functions";

export type MarketingPackageV61Record=Awaited<ReturnType<typeof listSiteMarketingPackagesV61>>[number];
export type MarketingPackageV61Release=Awaited<ReturnType<typeof listSiteMarketingPackageReleases>>[number];
export type MarketingArtifactV61Release=Awaited<ReturnType<typeof listSiteMarketingReleases>>[number];
export type MarketingReleaseComparison={
  id:string;format:MarketingFormat;mimeType:string;body:string;releaseNumber:number;
};

/** Pure release presentation. The mutable working Package, immutable outputs
 * and read-only comparison have no parallel document stores or save actions.
 */
export function MarketingPackageReleaseHistoryV61({
  siteId,record,versions,historicalSingles,loading,busy,compare,
  onDownloadPackage,onCompare,onDownloadOriginal,onDownloadPng,onCopyCaption,onCloseCompare,
}:{
  siteId:string;record:MarketingPackageV61Record;
  versions:MarketingPackageV61Release[];historicalSingles:MarketingArtifactV61Release[];
  loading:boolean;busy:boolean;compare:MarketingReleaseComparison|null;
  onDownloadPackage:(release:MarketingPackageV61Release)=>void;
  onCompare:(id:string,format:MarketingFormat,releaseNumber:number)=>void;
  onDownloadOriginal:(id:string)=>void;
  onDownloadPng:(id:string)=>void;
  onCopyCaption:(id:string)=>void;
  onCloseCompare:()=>void;
}){
  return <WorkspacePanel title="Package release history"
          description="Downloads are grouped by Package Release. Every version preserves its original Brand, message and outputs.">
          <div className="space-y-3">
            {loading&&<QueryState loading="Loading releases…"/>}
            {!loading&&versions.length===0&&
              <EmptyState title="No Package Releases yet."/>}
            {!loading&&versions.map((version,index)=>
              <DisclosureSection key={version.id} defaultOpen={index===0}
                title={`Package Release v${version.releaseNumber} · ${index===0?"Latest generated":"Previous version"}`}
                description={`${new Date(version.createdAt).toLocaleDateString()} · ${version.formats.length} materials`}>
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Saved content revision {version.packageRevision} · Brand preserved with this release
                  </p>
                  {!version.complete&&<WorkspaceNotice tone="attention">This historical release is incomplete.
                    You can still download the available files individually, but this set is incomplete.</WorkspaceNotice>}
                  {version.outputs.some(item=>item.withdrawnAt)&&<WorkspaceNotice tone="attention">
                    At least one material was withdrawn. The full Package is unavailable, but unaffected
                    original files may still be downloaded individually.</WorkspaceNotice>}
                  <Button type="button" variant="outline" size="sm" disabled={busy||!packageReleaseIsDownloadableV61(version)}
                    onClick={()=>void onDownloadPackage(version)}>
                    <Download className="size-4" aria-hidden="true"/> Download Package ZIP
                  </Button>
                  <ul className="space-y-2">
                    {version.outputs.map(item=><li key={item.id}
                      className="flex flex-wrap items-center justify-between gap-3 border p-3">
                      <span className="text-sm">{marketingFormatOptions.find(x=>x.id===item.format)?.label??item.format}
                        {item.withdrawnAt?" · Withdrawn":""}
                      </span>
                      <ActionFooter layout="inline" className="mt-0">
                        <Button type="button" variant="outline" size="sm"
                          disabled={busy||Boolean(item.withdrawnAt)}
                          onClick={()=>void onCompare(item.id,item.format,version.releaseNumber)}>
                          Compare
                        </Button>
                        <Button type="button" variant="outline" size="sm"
                          disabled={busy||Boolean(item.withdrawnAt)}
                          onClick={()=>void onDownloadOriginal(item.id)}>Original</Button>
                        {item.format!=="email"&&<Button type="button" variant="outline" size="sm"
                          disabled={busy||Boolean(item.withdrawnAt)}
                          onClick={()=>void onDownloadPng(item.id)}>PNG</Button>}
                        {item.format==="social"&&<Button type="button" variant="outline" size="sm"
                          disabled={busy||Boolean(item.withdrawnAt)}
                          onClick={()=>void onCopyCaption(item.id)}>Copy caption</Button>}
                      </ActionFooter>
                    </li>)}
                  </ul>
                </div>
              </DisclosureSection>)}
            {!loading&&historicalSingles.length>0&&<DisclosureSection title={`Previous individually generated materials (${historicalSingles.length})`}>
              <ul className="space-y-2">
                {historicalSingles.map(item=><li key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 border p-3">
                  <span className="text-xs">{item.format} · {new Date(item.createdAt).toLocaleDateString()}
                    {item.withdrawnAt?" · Withdrawn":""}</span>
                  <Button type="button" variant="outline" size="sm"
                    disabled={busy||Boolean(item.withdrawnAt)}
                    onClick={()=>void onDownloadOriginal(item.id)}>Download original</Button>
                </li>)}
              </ul>
            </DisclosureSection>}
            {compare&&<WorkspacePanel headingLevel="h3" title={`Compare ${compare.format} · Release v${compare.releaseNumber}`}
              actions={<Button type="button" variant="ghost" size="sm" onClick={onCloseCompare}>Close</Button>}>
              <div className="grid min-w-0 gap-3 lg:grid-cols-2">
                <div className="min-w-0 space-y-2">
                  <p className="text-sm font-semibold">Original released material</p>
                  {compare.mimeType==="image/svg+xml"
                    ? <img src={"data:image/svg+xml;charset=utf-8,"+encodeURIComponent(compare.body)}
                        alt={"Original "+compare.format+" from Package Release v"+compare.releaseNumber}
                        className="max-h-[36rem] max-w-full border bg-white object-contain"/>
                    : <iframe title="Original released email" sandbox="" srcDoc={compare.body}
                        className="h-[34rem] w-full border bg-white"/>}
                </div>
                <div className="min-w-0 space-y-2">
                  <p className="text-sm font-semibold">Your current materials</p>
                  {record.content.formats.includes(compare.format)
                    ? <MarketingMaterialPreviewV61 siteId={siteId} title={record.title}
                        brandVersionId={record.brandVersionId}
                        format={compare.format} content={record.content}/>
                    : <WorkspaceNotice>This format was removed from the working Package. It remains available in the original release.</WorkspaceNotice>}
                </div>
              </div>
            </WorkspacePanel>}
          </div>
        </WorkspacePanel>;
}

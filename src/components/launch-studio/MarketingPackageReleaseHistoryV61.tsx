import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkspaceNotice, WorkspacePanel } from "@/components/workspace";
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
            {loading&&<p role="status" className="text-sm text-muted-foreground">Loading releases…</p>}
            {!loading&&versions.length===0&&
              <p className="text-sm text-muted-foreground">No Package Releases yet.</p>}
            {!loading&&versions.map((version,index)=>
              <details key={version.id} className="border bg-background" open={index===0}>
                <summary className="cursor-pointer p-4 text-sm font-semibold">
                  Package Release v{version.releaseNumber} {index===0?"· Latest generated":"· Previous version"}
                  <span className="ml-2 font-normal text-muted-foreground">
                    {new Date(version.createdAt).toLocaleDateString()} · {version.formats.length} materials
                  </span>
                </summary>
                <div className="space-y-3 border-t p-4">
                  <p className="text-xs text-muted-foreground">
                    Saved content revision {version.packageRevision} · Brand preserved with this release
                  </p>
                  {!version.complete&&<WorkspaceNotice tone="attention">This historical release is incomplete.
                    Download the available original files individually; do not treat it as a full Package.</WorkspaceNotice>}
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
                      <div className="flex flex-wrap gap-2">
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
                      </div>
                    </li>)}
                  </ul>
                </div>
              </details>)}
            {!loading&&historicalSingles.length>0&&<details className="border bg-background">
              <summary className="cursor-pointer p-4 text-sm font-semibold">
                Previous individually generated materials ({historicalSingles.length})
              </summary>
              <ul className="space-y-2 border-t p-4">
                {historicalSingles.map(item=><li key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 border p-3">
                  <span className="text-xs">{item.format} · {new Date(item.createdAt).toLocaleDateString()}
                    {item.withdrawnAt?" · Withdrawn":""}</span>
                  <Button type="button" variant="outline" size="sm"
                    disabled={busy||Boolean(item.withdrawnAt)}
                    onClick={()=>void onDownloadOriginal(item.id)}>Download original</Button>
                </li>)}
              </ul>
            </details>}
            {compare&&<section aria-label="Compare Package material" className="space-y-3 border p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-sm">Compare {compare.format} · Release v{compare.releaseNumber}</h3>
                <Button type="button" variant="ghost" size="sm" onClick={()=>onCloseCompare()}>Close</Button>
              </div>
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
                  <p className="text-sm font-semibold">Current saved Package preview</p>
                  {record.content.formats.includes(compare.format)
                    ? <MarketingMaterialPreviewV61 siteId={siteId} title={record.title}
                        brandVersionId={record.brandVersionId}
                        format={compare.format} content={record.content}/>
                    : <p className="border p-4 text-sm">This format was removed from the working Package.
                        It remains available in the original release.</p>}
                </div>
              </div>
            </section>}
          </div>
        </WorkspacePanel>;
}

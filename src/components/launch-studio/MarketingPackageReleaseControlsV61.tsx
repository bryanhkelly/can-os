import { Button } from "@/components/ui/button";
import { WorkspaceNotice, WorkspacePanel } from "@/components/workspace";
import { packageReleaseChangesV61, type PackageChangeV61 } from "@/domain/marketing-package-release-v61";
import { siteMarketingTemplateVersions } from "@/domain/site-marketing-template-versions";
import type { MarketingPackageV61Record, MarketingPackageV61Release } from "./MarketingPackageReleaseHistoryV61";

const changeLabels: Partial<Record<PackageChangeV61,string>> = {
  templates: "creative templates", destination: "public link",
  withdrawn: "withdrawn materials", incomplete: "incomplete release",
};

/**
 * Shared Promote / Recruit / Interest Events release controls.
 * Pure presentation: immutable Release comparison is derived from the working
 * Package and its recorded outputs, never an independent approval or command.
 */
export function MarketingPackageReleaseControlsV61({
  record, versions, currentBrand, selectedBrandRevision, busy,
  releasesLoading, releasesUnavailable,
  onSelectCurrentBrand, onRetryHistory, onPreview, onRelease,
}: {
  record: MarketingPackageV61Record;
  versions: readonly MarketingPackageV61Release[];
  currentBrand: {id: string; revision: number} | null;
  selectedBrandRevision: number | null;
  busy: boolean;
  releasesLoading: boolean;
  releasesUnavailable: boolean;
  onSelectCurrentBrand: () => void;
  onRetryHistory: () => void;
  onPreview: () => void;
  onRelease: () => void;
}) {
  const latestPackageRelease = versions[0] ?? null;
  const packageChanges = packageReleaseChangesV61(record, latestPackageRelease, {
    templateVersions: siteMarketingTemplateVersions,
    publicDestinationUrl: latestPackageRelease?.currentPublicDestinationUrl,
  });
  const packageUpToDate = Boolean(latestPackageRelease?.complete && packageChanges.length === 0);

  return <WorkspacePanel title="Package release"
          description="Release every selected format together. A Package Release is a frozen set; edits never change an earlier download or email.">
          <div className="space-y-4">
            <p className="text-sm">Selected identity:
              <strong>{record.brandVersionId
                ? selectedBrandRevision!==null
                  ? " Brand v"+selectedBrandRevision
                  : " Saved Site Brand"
                : " No saved Brand selected"}</strong>
            </p>
            {currentBrand&&currentBrand.id!==record.brandVersionId&&
              <div className="flex flex-wrap items-center justify-between gap-3 border p-3">
                <p className="text-sm">Brand v{currentBrand.revision} is available in Establish.
                  Updating your working Package will not change older releases.</p>
                <Button type="button" variant="outline" disabled={busy||record.status==="archived"}
                  onClick={onSelectCurrentBrand}>Use newer Brand</Button>
              </div>}
            {releasesLoading&&<p role="status" className="text-sm text-muted-foreground">Loading Package Release history…</p>}
            {releasesUnavailable&&<WorkspaceNotice tone="attention">Package history is unavailable. To avoid duplicate releases, reload the history before generating new material.
              <Button type="button" variant="outline" size="sm"
                onClick={onRetryHistory}>Retry history</Button>
            </WorkspaceNotice>}
            {!releasesLoading&&latestPackageRelease&&<div className="space-y-2 border bg-muted/25 p-4">
              <p className="text-sm font-semibold">Latest generated: Package Release v{latestPackageRelease.releaseNumber}</p>
              {packageChanges.length
                ? <p className="text-sm">Updates available: {packageChanges.map(change=>changeLabels[change]??change).join(", ")}. Preview and release an updated Package when ready.</p>
                : <p className="text-sm text-muted-foreground">The working Package matches the latest generated release. Reuse that release instead of creating a duplicate.</p>}
            </div>}
            {!releasesLoading&&!latestPackageRelease&&
              <p className="text-sm text-muted-foreground">This Package has no grouped release yet. Your first release will contain every selected format.</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={busy||record.status==="archived"}
                onClick={onPreview}>
                Preview Package
              </Button>
              <Button type="button" disabled={busy||releasesLoading||releasesUnavailable||record.status==="archived"||!record.brandVersionId||packageUpToDate||!record.content.formats.length}
                onClick={onRelease}>
                {latestPackageRelease?"Release Updated Package":"Release Package"}
              </Button>
            </div>
            <WorkspaceNotice tone="info">Release creates all selected formats atomically. It does not publish the website,
              send email, update scheduled communications, or change earlier Package Releases.</WorkspaceNotice>
          </div>
        </WorkspacePanel>;
}

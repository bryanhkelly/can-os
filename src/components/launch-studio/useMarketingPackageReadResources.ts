import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { readSiteBrandVersionView } from "@/modules/sites/site-brand.functions";
import { listSiteMarketingPackageReleases, listSiteMarketingReleases } from "@/modules/programs/site-marketing-artifacts.functions";
import type { listSiteMarketingPackagesV61 } from "@/modules/programs/site-marketing-packages-v61.functions";
import type { MarketingEditorView } from "./marketing-package-editor-state";

type PackageRecord = Awaited<ReturnType<typeof listSiteMarketingPackagesV61>>[number];

/** One resource loader per mounted Site + module editor.
 * A single effect owns the current Site Brand; Package history reads only
 * its pinned immutable Brand revision. Stale responses are never committed.
 * Release command execution and saving drafts remain in the editor controller.
 */
export function useMarketingPackageReadResources(
  siteId: string,
  view: MarketingEditorView,
  record: PackageRecord | null,
  setError: Dispatch<SetStateAction<string>>,
) {
  const [releases,setReleases]=useState<Awaited<ReturnType<typeof listSiteMarketingReleases>>>([]);
  const [packageReleases,setPackageReleases]=useState<Awaited<ReturnType<typeof listSiteMarketingPackageReleases>>>([]);
  const [releasesLoading,setReleasesLoading]=useState(false);
  const [releasesUnavailable,setReleasesUnavailable]=useState(false);
  const [releaseRefreshKey,setReleaseRefreshKey]=useState(0);
  const [currentBrand,setCurrentBrand]=useState<{id:string;revision:number}|null>(null);
  const [brandReadiness,setBrandReadiness]=useState<"loading"|"available"|"missing"|"unavailable">("loading");
  const [brandRefreshKey,setBrandRefreshKey]=useState(0);
  const [selectedBrandRevision,setSelectedBrandRevision]=useState<number|null>(null);
  // Shared prerequisite for Create Outreach and My Outreach. Brand edits
  // stay in Shape; a Marketing Package only selects an immutable version.
  useEffect(()=>{
    let live=true;
    setBrandReadiness("loading");
    setCurrentBrand(null);
    void readSiteBrandVersionView({data:{siteId}})
      .then(brand=>{
        if(!live)return;
        const version=brand.current?.version;
        setCurrentBrand(version?{id:version.id,revision:version.revision}:null);
        setBrandReadiness(version?"available":"missing");
      })
      .catch(()=>{if(live)setBrandReadiness("unavailable");});
    return ()=>{live=false;};
  },[siteId,brandRefreshKey]);
  const packageId=record?.id??null;
  const pinnedBrandVersionId=record?.brandVersionId??null;
  useEffect(()=>{
    if((view!=="detail"&&view!=="share"&&view!=="followup")||!packageId)return;
    let live=true;
    setReleasesLoading(true);setReleasesUnavailable(false);
    setReleases([]);setPackageReleases([]);setCompare(null);
    setSelectedBrandRevision(null);
    void Promise.all([
      listSiteMarketingReleases({data:{siteId,packageId}}),
      listSiteMarketingPackageReleases({data:{siteId,packageId}}),
      pinnedBrandVersionId
        ? readSiteBrandVersionView({data:{siteId,versionId:pinnedBrandVersionId}})
        : Promise.resolve(null),
    ]).then(([records,packageVersions,selected])=>{
      if(live){setReleases(records);setPackageReleases(packageVersions);setReleasesLoading(false);
        setReleasesUnavailable(false);
        // Current Brand has one owner above; history resolves only the
        // exact immutable Brand version pinned to the selected Package.
        setSelectedBrandRevision(selected?.current?.version.revision??null);}
    }).catch(error=>{if(live){setError(error instanceof Error ? error.message : "The outreach history could not be loaded.");setReleasesLoading(false);
      setReleasesUnavailable(true);}});
    return ()=>{live=false;};
  },[view,packageId,pinnedBrandVersionId,siteId,releaseRefreshKey]);
  return {
    releases,setReleases,packageReleases,setPackageReleases,
    releasesLoading,setReleasesLoading,releasesUnavailable,setReleasesUnavailable,
    setReleaseRefreshKey,currentBrand,brandReadiness,setBrandRefreshKey,
    selectedBrandRevision,
  };
}

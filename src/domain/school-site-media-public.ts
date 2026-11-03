import {planSchoolSiteMedia,type SiteMediaPhoto,type SchoolSiteMediaSlot}
  from "./school-site-media-selection";

export type PublicSchoolSiteMedia=Partial<Record<SchoolSiteMediaSlot,{
  src:string;altText:string;assetId:string;sourceRevision:string;
}>>;

/** Pure composition only. Server supplies the exact owned, canonical host.
 * No arbitrary URL or file path is accepted from a church or public caller.
 * Rights and subject consents were checked in the owning read service. */
export function projectApprovedSchoolSiteMedia(
  siteId:string,schoolHost:string,photos:readonly SiteMediaPhoto[],
):PublicSchoolSiteMedia {
  if(!/^[a-z0-9.-]+\.can-os\.com$/i.test(schoolHost) &&
    !/^[a-z0-9.-]+\.schools\.example\.org$/i.test(schoolHost))
    return {};
  const byId=new Map(photos.map(photo=>[photo.id,photo]));
  const plan=planSchoolSiteMedia(siteId,photos);
  const result:PublicSchoolSiteMedia={};
  for(const assignment of plan.assignments){
    const photo=byId.get(assignment.assetId);
    if(!photo)continue;
    result[assignment.slot]={
      src:`https://${schoolHost}/media/${assignment.assetId}`,
      altText:photo.altText,
      assetId:assignment.assetId,
      sourceRevision:assignment.sourceRevision,
    };
  }
  return result;
}

import {planSchoolSiteMedia,type SiteMediaPhoto,type SchoolSiteMediaSlot}
  from "./school-site-media-selection";
import {slugFromPublicSiteHost} from "./public-site-address";

export type PublicSchoolSiteMedia=Partial<Record<SchoolSiteMediaSlot,{
  src:string;altText:string;assetId:string;sourceRevision:string;
  width?:number;height?:number;
}>>;

/** Pure composition only. Server supplies the exact owned, canonical host.
 * No arbitrary URL or file path is accepted from a church or public caller.
 * Rights and subject consents were checked in the owning read service. */
export function projectApprovedSchoolSiteMedia(
  siteId:string,schoolHost:string,photos:readonly SiteMediaPhoto[],
):PublicSchoolSiteMedia {
  if(!slugFromPublicSiteHost(schoolHost))return {};
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
      width:photo.width,height:photo.height,
    };
  }
  return result;
}

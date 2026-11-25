/** Existing Course lesson media is authored in two shapes:
 * `resources` for subject-specific lesson materials and `videoResources`
 * for supplemental demonstration candidates. Retain both for review and diagnostics;
 * learner playback must exclude unapproved supplemental candidates. */
export type CanonicalLessonVideo = {
  url:string;
  title:string;
  reviewStatus:string;
};

const allowedVideoUrl=/^https:\/\/(?:www\.)?(?:youtube\.com\/watch\?|youtube\.com\/shorts\/|youtu\.be\/|vimeo\.com\/)/i;

export function canonicalLessonVideoResources(content:Record<string,unknown>,
  {includeSupplementalCandidates=true}:{includeSupplementalCandidates?:boolean}={}):CanonicalLessonVideo[]{
  const videos:CanonicalLessonVideo[]=[];
  const seen=new Set<string>();
  for(const source of ["resources","videoResources"] as const){
    if(source==="videoResources"&&!includeSupplementalCandidates)continue;
    const entries=content[source];
    if(!Array.isArray(entries))continue;
    for(const entry of entries){
      if(!entry||typeof entry!=="object"||Array.isArray(entry))continue;
      const item=entry as Record<string,unknown>;
      if(typeof item.url!=="string"||!allowedVideoUrl.test(item.url))continue;
      if(seen.has(item.url))continue;
      seen.add(item.url);
      videos.push({
        url:item.url,
        title:typeof item.title==="string"&&item.title.trim()?item.title:"Lesson video",
        reviewStatus:typeof item.reviewStatus==="string"
          ?item.reviewStatus
          :source==="resources"?"original_resource_review_unverified":"unreviewed",
      });
      if(videos.length>=10)return videos;
    }
  }
  return videos;
}

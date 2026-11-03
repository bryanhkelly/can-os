import {describe,expect,it} from "vitest";
import {planSchoolSiteMedia,schoolSiteMediaSlots,type SiteMediaPhoto} from "@/domain/school-site-media-selection";

const photo=(id:string,tags:string[],other:Partial<SiteMediaPhoto>={}):SiteMediaPhoto=>({
  id,siteId:"school-a",width:1600,height:900,tags,altText:"Reviewed school image",
  rightsStatus:"approved",subjectReleaseStatus:"not_required",
  mediaReviewStatus:"approved",sourceRevision:"revision-1",
  visualFamily:"warm-natural",...other,
});

describe("folder-first school media composition",()=>{
  it("automatically assigns distinct rights-cleared, well-tagged photos across pages",()=>{
    const plan=planSchoolSiteMedia("school-a",[
      photo("hero",["school","community","students"]),
      photo("about",["church","leadership","gathering"]),
      photo("academics",["classroom","science","teacher"]),
      photo("student",["activities","arts","sports"]),
      photo("campus",["building","campus","facilities"]),
      photo("families",["family","events","welcome"]),
    ]);
    expect(plan.assignments).toHaveLength(schoolSiteMediaSlots.length);
    expect(plan.unfilled).toEqual([]);
    expect(new Set(plan.assignments.map(x=>x.assetId)).size).toBe(schoolSiteMediaSlots.length);
    expect(plan.assignments[0]).toMatchObject({slot:"hero",assetId:"hero",crop:"wide"});
    expect(plan.status).toBe("review_required");
  });

  it("will not select other schools' imagery, unreviewed child images or revoked assets",()=>{
    const plan=planSchoolSiteMedia("school-a",[
      photo("other",["school","community"],{siteId:"school-b"}),
      photo("revoked",["school","community"],{rightsStatus:"revoked"}),
      photo("child-pending",["students","classroom"],{subjectReleaseStatus:"pending"}),
      photo("not-reviewed",["campus","building"],{mediaReviewStatus:"pending"}),
      photo("unlabeled",["school","community"],{altText:""}),
    ]);
    expect(plan.assignments).toEqual([]);
    expect(plan.unfilled).toEqual([...schoolSiteMediaSlots]);
  });

  it("makes stable assignments independently of source folder ordering",()=>{
    const photos=[
      photo("z-photo",["school","community"]),
      photo("a-photo",["school","community"]),
    ];
    expect(planSchoolSiteMedia("school-a",photos).assignments)
      .toEqual(planSchoolSiteMedia("school-a",[...photos].reverse()).assignments);
    expect(planSchoolSiteMedia("school-a",photos).assignments[0]?.assetId).toBe("a-photo");
  });

  it("does not fill slots with unrelated pictures just to produce a photograph",()=>{
    const plan=planSchoolSiteMedia("school-a",[photo("random",["coffee","dog"])]);
    expect(plan.assignments).toEqual([]);
    expect(plan.unfilled).toEqual([...schoolSiteMediaSlots]);
  });
});

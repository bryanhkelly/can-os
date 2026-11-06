import {describe,expect,it} from "vitest";
import {siteMediaUploadSchema,siteMediaReviewSchema,
  suggestSiteMediaTags,siteMediaDecorativeAlt} from "@/domain/site-media-folder";
import {planSchoolSiteMedia,type SiteMediaPhoto} from "@/domain/school-site-media-selection";
import {projectApprovedSchoolSiteMedia} from "@/domain/school-site-media-public";
import {classifyPublicSiteRequest} from "@/domain/public-site-host-routing";
import {isPublicSiteReadPath} from "@/domain/public-site-paths";
import {renderPublicSiteHtml} from "@/domain/public-site-html";
import {emptySiteLocalContent} from "@/domain/site-local-content";

const site="11111111-1111-4111-8111-111111111111";
const image="22222222-2222-4222-8222-222222222222";
const input={siteId:site,fileName:"school-day.jpg",folderPath:"Learning/Classrooms",
  mimeType:"image/jpeg" as const,size:1024,width:1600,height:900};

describe("school media folder end-to-end contracts",()=>{
  it("validates image dimensions, types and names before issuing private upload URLs",()=>{
    expect(siteMediaUploadSchema.parse(input)).toMatchObject(input);
    expect(()=>siteMediaUploadSchema.parse({...input,fileName:"../../private.csv"})).toThrow();
    expect(()=>siteMediaUploadSchema.parse({...input,mimeType:"image/svg+xml"})).toThrow();
    expect(()=>siteMediaUploadSchema.parse({...input,size:30*1024*1024})).toThrow();
    expect(()=>siteMediaUploadSchema.parse({...input,width:20})).toThrow();
  });
  it("suggests fixed, bounded tags without publishing folder names as captions",()=>{
    const tags=suggestSiteMediaTags("School/Robotics", "Classroom-STEM.JPG");
    expect(tags).toContain("school");
    expect(tags).toContain("classroom");
    expect(tags).toContain("stem");
    expect(tags).not.toContain("secret");
    expect(siteMediaDecorativeAlt(tags)).toContain("Decorative");
  });
  it("requires exact folder-wide photo rights and release acknowledgement",()=>{
    const review={siteId:site,documentIds:[image],rightsConfirmed:true,
      subjectRelease:"no_identifiable_people",
      confirmEachFileCovered:true,reason:"All approved illustrations are ours to publish."};
    expect(siteMediaReviewSchema.parse(review)).toMatchObject(review);
    expect(()=>siteMediaReviewSchema.parse({...review,rightsConfirmed:false})).toThrow();
    expect(()=>siteMediaReviewSchema.parse({...review,documentIds:[image,image]})).toThrow();
    expect(()=>siteMediaReviewSchema.parse({...review,subjectRelease:"unknown"})).toThrow();
  });
  it("makes only same-tenant UUID media URLs reachable on tenant-origin GET",()=>{
    expect(isPublicSiteReadPath("/media/"+image)).toBe(true);
    expect(isPublicSiteReadPath("/media/../../admin")).toBe(false);
    expect(isPublicSiteReadPath("/media/private-key")).toBe(false);
    const host="https://example-school.can-os.com";
    expect(classifyPublicSiteRequest(host+"/media/"+image,"GET",true))
      .toEqual({kind:"site",slug:"example-school",rewrite:true});
    expect(classifyPublicSiteRequest(host+"/media/"+image,"POST",true).kind)
      .toBe("deny");
  });
  it("composes approved school photos and does not invent unapproved fallback artwork",()=>{
    const approved:SiteMediaPhoto={id:image,siteId:site,tags:["school","community"],
      width:1800,height:1200,altText:"Decorative photo from the school's media folder",
      rightsStatus:"approved",subjectReleaseStatus:"not_required",
      mediaReviewStatus:"approved",sourceRevision:"1",visualFamily:"heritage"};
    const media=projectApprovedSchoolSiteMedia(site,"example-school.can-os.com",[approved]);
    expect(media.hero?.assetId).toBe(image);
    expect(media.hero?.src).toBe("https://example-school.can-os.com/media/"+image);
    expect(media.academics).toBeUndefined();
    const page={host:"example-school.can-os.com",site:{name:"Example School",organizationName:"Church"},
      offerings:[],localContent:emptySiteLocalContent,media};
    const home=renderPublicSiteHtml(page);
    expect(home).toContain('src="https://example-school.can-os.com/media/'+image+'"');
    const about=renderPublicSiteHtml({...page,localContent:{
      ...emptySiteLocalContent,localDescription:"A local community story.",
    }},{path:"/about"});
    expect(about).not.toContain("original-artwork");
    const malicious=renderPublicSiteHtml({...page,media:{hero:{...media.hero!,
      src:"https://other-school.can-os.com/media/"+image}}});
    expect(malicious).not.toContain("other-school.can-os.com/media");
    expect(malicious).not.toContain("original-artwork");
    expect(planSchoolSiteMedia(site,[{...approved,rightsStatus:"revoked"}]).assignments).toEqual([]);
  });
});

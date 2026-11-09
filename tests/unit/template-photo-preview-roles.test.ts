import {afterEach,describe,expect,it,vi} from "vitest";
import {renderPublicSiteHtml} from "@/domain/public-site-html";
import {emptySiteLocalContent} from "@/domain/site-local-content";

const page={
  host:"fictional.preview.example",site:{
    name:"Illustrative School",organizationName:"CAN demonstration",
  },
  offerings:[],demonstration:true,
  localContent:{...emptySiteLocalContent,
    schoolVision:"An illustrative, fictional school learning community.",
    branding:{
    ...emptySiteLocalContent.branding,
    theme:"classic" as const,paletteId:"heritage" as const,
    typographyId:"editorial" as const,heroImage:null,
  }},
};
afterEach(()=>vi.unstubAllEnvs());
describe("all twelve template photo roles have nonpublished preview placements",()=>{
  it("uses program_03 on academics only when the complete demo library is ready",()=>{
    vi.stubEnv("CAN_TEMPLATE_PHOTOGRAPHY_GENERATE","true");
    vi.stubEnv("CAN_TEMPLATE_PHOTO_EXTRA_SECTIONS_ENABLED","true");
    vi.stubEnv("CAN_TEMPLATE_PHOTO_RESPONSIVE_ENABLED","true");
    const html=renderPublicSiteHtml(page,{
      sampleTemplate:"heritage",templateGallery:true,localPreview:true,path:"/academics",
    });
    expect(html).toContain("/template-photo/heritage/program_03");
    expect(html).toContain("Creative exploration");
    expect(html).toContain('srcset="/template-photo/heritage/');
  });
  it("uses portrait_01 on student-life without changing actual public schools",()=>{
    vi.stubEnv("CAN_TEMPLATE_PHOTOGRAPHY_GENERATE","true");
    vi.stubEnv("CAN_TEMPLATE_PHOTO_EXTRA_SECTIONS_ENABLED","true");
    const preview=renderPublicSiteHtml(page,{
      sampleTemplate:"community",templateGallery:true,localPreview:true,path:"/student-life",
    });
    expect(preview).toContain("/template-photo/community/portrait_01");
    const published=renderPublicSiteHtml(page,{path:"/student-life"});
    expect(published).not.toContain("/template-photo/community/portrait_01");
  });
  it("does not introduce broken extra images before library readiness",()=>{
    vi.stubEnv("CAN_TEMPLATE_PHOTOGRAPHY_GENERATE","true");
    vi.stubEnv("CAN_TEMPLATE_PHOTO_EXTRA_SECTIONS_ENABLED","false");
    const preview=renderPublicSiteHtml(page,{
      sampleTemplate:"modern",templateGallery:true,localPreview:true,path:"/academics",
    });
    expect(preview).not.toContain("/template-photo/modern/program_03");
  });
});

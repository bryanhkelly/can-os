import {describe,expect,it} from "vitest";
import {renderPublicSiteHtml,availablePublicSitePaths} from "@/domain/public-site-html";
import {projectSiteEnrollmentOpportunities} from "@/domain/site-enrollment-opportunities";
import {siteTemplateIds} from "@/domain/site-theme";
import {emptySiteLocalContent} from "@/domain/site-local-content";

const release="11111111-1111-4111-8111-111111111111";
const offerings=projectSiteEnrollmentOpportunities({
  noncredit:[{releaseId:release,title:"Digital Skills",siteName:"Community Center",
    seatsRemaining:5,waitlistAvailable:false}],
  classes:[{classId:"22222222-2222-4222-8222-222222222222",
    title:"AI Skills – Four Sessions",deliveryMode:"facilitated",
    nextStartsAt:"2026-12-05T18:00:00.000Z"}],
  enrollmentOrigin:"https://app.example.org",
});
const page=(templateId:typeof siteTemplateIds[number])=>({
  host:"learning.example.org",
  site:{name:"Community Learning Center",organizationName:"Example Community"},
  offerings:[],
  enrollmentOpportunities:offerings,
  localContent:{...emptySiteLocalContent,
    branding:{...emptySiteLocalContent.branding,templateId}},
});

describe("Enrollment-driven public website navigation and templates",()=>{
  it("exposes Courses and Classes, not unreviewed admissions, in all seven designs",()=>{
    for(const templateId of siteTemplateIds){
      const site=page(templateId);
      const paths=availablePublicSitePaths(site);
      expect(paths).toContain("/courses");
      expect(paths).toContain("/classes");
      expect(paths).not.toContain("/admissions");
      expect(paths).not.toContain("/academics");
      const home=renderPublicSiteHtml(site);
      expect(home).toContain('href="/courses"');
      expect(home).toContain('href="/classes"');
      expect(home).not.toContain('href="/admissions"');
      expect(home).toContain("Community Learning Center");
      const course=renderPublicSiteHtml(site,{path:"/courses"});
      expect(course).toContain("Digital Skills");
      expect(course).toContain('href="https://app.example.org/learn/enroll?release='+release+'"');
      expect(course).toContain("Register for Course");
      expect(course).toContain('template-'+templateId);
      const classes=renderPublicSiteHtml(site,{path:"/classes"});
      expect(classes).toContain("AI Skills");
      expect(classes).toContain("View this Class");
      expect(classes).toContain("learn/classes?classId=22222222-2222-4222-8222-222222222222");
      expect(classes).not.toContain("Enroll in Class");
    }
  });
  it("keeps the approved Course directory even when unrelated blocks share its page",()=>{
    const site={...page("modern"),contentBlocks:[{
      id:"community-hero",channel:"learning.enrichment" as const,
      page:"/courses" as const,placement:"learning" as const,layout:"cards" as const,
      enabled:true,eyebrow:"Community",title:"Community programs",
      description:"Approved community content",items:[{
        id:"community-item",title:"Community outreach",
        description:"An independently published community Program",label:"Program",
      }],
    }]};
    const html=renderPublicSiteHtml(site,{path:"/courses"});
    expect(html).toContain("Community outreach");
    expect(html).toContain("Digital Skills");
    expect(html).toContain("/learn/enroll?release="+release);
    expect(html.split('data-content-channel="learning.opportunities"').length-1).toBe(1);
  });
  it("uses a Course-specific custom block instead of duplicating its automatic directory",()=>{
    const site={...page("heritage"),contentBlocks:[{
      id:"featured-course",channel:"learning.opportunities" as const,
      page:"/courses" as const,targetKinds:["course" as const],
      placement:"learning" as const,layout:"featured" as const,
      enabled:true,eyebrow:"Featured",title:"Our Courses",
      description:"Site-selected Course presentation",items:[{
        id:"course:"+release,title:"Digital Skills",description:"Featured public Course",
        label:"Registration available",
        link:{href:"https://app.example.org/learn/enroll?release="+release,
          label:"Register for Course"},
      }],
    }]};
    const html=renderPublicSiteHtml(site,{path:"/courses"});
    expect(html).toContain("Our Courses");
    expect(html.split('data-content-channel="learning.opportunities"').length-1).toBe(1);
    expect(html).toContain("Digital Skills");
  });
  it("renders approved Program registration on all seven templates using exact Season IDs",()=>{
    const season="33333333-3333-4333-8333-333333333333";
    const opportunities=projectSiteEnrollmentOpportunities({
      enrichment:[{seasonId:season,title:"Summer Arts",programName:"Youth Program",
        registrationOpen:true}],
      enrollmentOrigin:"https://app.example.org",
    });
    for(const templateId of siteTemplateIds){
      const site={...page(templateId),enrollmentOpportunities:opportunities};
      const html=renderPublicSiteHtml(site,{path:"/programs"});
      expect(html).toContain("Summer Arts");
      expect(html).toContain("View details and register");
      expect(html).toContain("https://app.example.org/enrichment/"+season);
      const preview=renderPublicSiteHtml(site,{path:"/programs",localPreview:true});
      expect(preview).not.toContain("https://app.example.org/enrichment/");
    }
  });
  it("hides direct enrollment actions in read-only preview, but retains content",()=>{
    const site=page("modern");
    for(const route of ["/courses","/classes"] as const){
      const html=renderPublicSiteHtml(site,{path:route,localPreview:true});
      expect(html).toContain(route==="/courses"?"Digital Skills":"AI Skills");
      expect(html).not.toContain('href="https://app.example.org/');
      expect(html).not.toContain("<form");
    }
  });
  it("does not open empty Catalog pages or invent routes without published content",()=>{
    const site={
      host:"learning.example.org",
      site:{name:"New Site",organizationName:"Host"},
      offerings:[],
      localContent:emptySiteLocalContent,
    };
    const paths=availablePublicSitePaths(site);
    expect(paths).not.toContain("/programs");
    expect(paths).not.toContain("/courses");
    expect(paths).not.toContain("/classes");
    expect(()=>renderPublicSiteHtml(site,{path:"/courses"})).toThrow();
    const preview=renderPublicSiteHtml(site,{
      path:"/courses",localPreview:true,privateDraftPages:true,
    });
    expect(preview).toContain("No approved Courses to display yet");
    expect(preview).toContain("Private design preview · not published");
    expect(preview).not.toContain("Register for Course");
    expect(preview).not.toContain("<form");
  });
  it("includes real Program discovery without promising unverified enrollment",()=>{
    const site={...page("community"),enrollmentOpportunities:
      projectSiteEnrollmentOpportunities({enrichment:[{
        seasonId:"summer-a",title:"Summer Arts",programName:"Youth Program",registrationOpen:true,
      }]})};
    expect(availablePublicSitePaths(site)).toContain("/programs");
    expect(availablePublicSitePaths(site)).toContain("/student-life");
    expect(availablePublicSitePaths(site)).not.toContain("/courses");
    const html=renderPublicSiteHtml(site,{path:"/programs"});
    expect(html).toContain("Summer Arts");
    expect(html).toContain('href="/student-life"');
    expect(html).not.toContain("Register for Program");
  });
});

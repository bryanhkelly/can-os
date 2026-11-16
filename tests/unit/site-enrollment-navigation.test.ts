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
      expect(classes).toContain("Find this Class");
      expect(classes).toContain("learn/classes?search=AI+Skills");
      expect(classes).not.toContain("Enroll in Class");
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
  });
  it("includes real Program discovery without promising unverified enrollment",()=>{
    const site={...page("community"),enrollmentOpportunities:
      projectSiteEnrollmentOpportunities({enrichment:[{
        seasonId:"summer-a",title:"Summer Arts",programName:"Youth Program",registrationOpen:true,
      }]})};
    expect(availablePublicSitePaths(site)).toContain("/programs");
    expect(availablePublicSitePaths(site)).not.toContain("/courses");
    const html=renderPublicSiteHtml(site,{path:"/programs"});
    expect(html).toContain("Summer Arts");
    expect(html).toContain('href="/student-life"');
    expect(html).not.toContain("Register for Program");
  });
});

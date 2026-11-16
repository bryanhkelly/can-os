import {describe,expect,it} from "vitest";
import {projectSiteEnrollmentOpportunities,enrollmentOpportunityKinds} from "@/domain/site-enrollment-opportunities";
import {resolveSiteExperienceProfile} from "@/domain/site-website-experience";
import {defaultSiteContentChannelConfig,resolveSiteContentBlocks,siteContentChannelConfigSchema} from "@/domain/site-content-channels";
const release="11111111-1111-4111-8111-111111111111";
const catalog={
  academicPrograms:[{
    programId:"school-a",title:"Community Academy",typeLabel:"School",
    summary:"Approved academic marketing description",grades:{min:"6",max:"12"},
    delivery:{onsite:true,asynchronous:false,liveOnline:false,onsiteDaysPerWeek:5},
    availability:"operating" as const,applicationOpen:false,
  }],
  enrichment:[{seasonId:"summer-a",title:"Summer Arts",programName:"Youth Program",
    registrationOpen:true}],
  noncredit:[{releaseId:release,title:"Digital Skills",siteName:"Learning Center",
    seatsRemaining:10,waitlistAvailable:false}],
  classes:[{classId:"22222222-2222-4222-8222-222222222222",title:"AI Skills – Four Sessions",
    deliveryMode:"facilitated" as const,nextStartsAt:"2026-12-05T18:00:00.000Z"}],
  enrollmentOrigin:"https://app.example.org",
};

describe("Public Enrollment Opportunity read model",()=>{
  it("distinguishes four target types without creating duplicate enrollment writes",()=>{
    const items=projectSiteEnrollmentOpportunities(catalog);
    expect(items.map(item=>item.kind)).toEqual(["school","program","course","class"]);
    expect(enrollmentOpportunityKinds(items)).toEqual({
      school:true,program:true,course:true,class:true,
    });
    expect(resolveSiteExperienceProfile(items)).toBe("mixed");
    expect(items.every(item=>!item.id.includes("undefined"))).toBe(true);
  });
  it("gates school applications on independently approved applicationOpen",()=>{
    const closed=projectSiteEnrollmentOpportunities({
      academicPrograms:catalog.academicPrograms,
    })[0]!;
    expect(closed.status).toBe("explore");
    expect(closed.action).toEqual({href:"/academics",label:"Explore program"});
    const open=projectSiteEnrollmentOpportunities({
      academicPrograms:[{...catalog.academicPrograms[0]!,applicationOpen:true}],
    })[0]!;
    expect(open.status).toBe("apply");
    expect(open.action?.href).toBe("/admissions");
  });
  it("never invents a direct Program registration action from marketing",()=>{
    const program=projectSiteEnrollmentOpportunities({
      enrichment:catalog.enrichment,
    })[0]!;
    expect(program.kind).toBe("program");
    expect(program.status).toBe("explore");
    expect(program.action?.href).toBe("/student-life");
  });
  it("links only real noncredit Course releases to verified HTTPS app enrollment",()=>{
    const [course]=projectSiteEnrollmentOpportunities({
      noncredit:catalog.noncredit,enrollmentOrigin:catalog.enrollmentOrigin,
    });
    expect(course?.status).toBe("register");
    expect(course?.action?.href)
      .toBe("https://app.example.org/learn/enroll?release="+release);
    const [waitlist]=projectSiteEnrollmentOpportunities({
      noncredit:[{...catalog.noncredit[0]!,seatsRemaining:0,waitlistAvailable:true}],
      enrollmentOrigin:catalog.enrollmentOrigin,
    });
    expect(waitlist?.status).toBe("waitlist");
    expect(waitlist?.action?.label).toContain("waitlist");
    const noOrigin=projectSiteEnrollmentOpportunities({
      noncredit:catalog.noncredit,enrollmentOrigin:"http://untrusted.example",
    })[0]!;
    expect(noOrigin.status).toBe("explore");
    expect(noOrigin.action).toBeUndefined();
    const unavailable=projectSiteEnrollmentOpportunities({
      noncredit:[{...catalog.noncredit[0]!,seatsRemaining:0,waitlistAvailable:false}],
      enrollmentOrigin:catalog.enrollmentOrigin,
    })[0]!;
    expect(unavailable.status).toBe("closed");
    expect(unavailable.action).toBeUndefined();
    expect(projectSiteEnrollmentOpportunities({
      noncredit:[{...catalog.noncredit[0]!,releaseId:"non-uuid"}],
      enrollmentOrigin:catalog.enrollmentOrigin,
    })).toEqual([]);
  });
  it("opens filtered public Class discovery but never calls self-enrollment by inference",()=>{
    const [item]=projectSiteEnrollmentOpportunities({
      classes:catalog.classes,enrollmentOrigin:catalog.enrollmentOrigin,
    });
    expect(item?.kind).toBe("class");
    expect(item?.status).toBe("explore");
    expect(item?.action?.label).toBe("View this Class");
    expect(item?.action?.href).toContain("/learn/classes?classId=22222222-2222-4222-8222-222222222222");
    expect(item?.action?.href).not.toContain("offering=");
    expect(resolveSiteExperienceProfile([item!])).toBe("training");
  });
  it("reuses approved sources across multiple ordered Site blocks",()=>{
    const initial=defaultSiteContentChannelConfig.blocks.find(
      item=>item.channel==="learning.opportunities")!;
    const config=siteContentChannelConfigSchema.parse({
      version:2,revision:1,blocks:[
        {...initial,id:"course-section",enabled:true,page:"/courses",
          targetKinds:["course"],limit:1},
        {...initial,id:"class-section",enabled:true,page:"/classes",
          targetKinds:["class"],limit:3},
      ],
    });
    const projected=resolveSiteContentBlocks(config,{mode:"public",...catalog});
    expect(projected.map(block=>block.id)).toEqual(["course-section","class-section"]);
    expect(projected[0]?.items.map(item=>item.title)).toEqual(["Digital Skills"]);
    expect(projected[1]?.items.map(item=>item.title)).toEqual(["AI Skills – Four Sessions"]);
    const privateProjection=resolveSiteContentBlocks(config,{mode:"private",...catalog});
    expect(privateProjection.every(block=>block.items.every(item=>!item.link))).toBe(true);
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { initialMarketingContent, initialOutreachPlanV61, marketingPurposeOptions } from "@/domain/marketing-package-v61";
import { MarketingPackageWizardV61 } from "./MarketingPackageWizardV61";
import type { SiteProgramsAudiencesV61 } from "@/domain/site-launch-preferences";

const content = {
  ...initialMarketingContent("Test Learning Site","site-announcement"),
  plan:initialOutreachPlanV61(["adults","older_adults"]),
};
const props = {
  siteId:"00000000-0000-4000-8000-000000000121",
  siteName:"Test Learning Site",siteIntent:{
    interestIds:["adult","senior"],timingIds:[],audienceIds:["adults","older_adults"],
    startingFocus:"adult",experienceIds:["financial-literacy"],
  } as SiteProgramsAudiencesV61,
  step:0,title:"Community introduction",content,
  busy:false,brandVersionId:null,currentSuggestion:null,
  purposeOptions:marketingPurposeOptions,activePreviewFormat:null,
  starter:(purpose:typeof content.purpose)=>initialMarketingContent("Test Learning Site",purpose),
  onTitleChange:vi.fn(),onPatch:vi.fn(),onPreviewFormatChange:vi.fn(),
  onBack:vi.fn(),onSaveExit:vi.fn(),onNext:vi.fn(),hasSavedPackage:false,
};

describe("Share V6.1 guided outreach editor",()=>{
  it("uses six shared progress steps and distinguishes recipients from beneficiaries",()=>{
    const html=renderToStaticMarkup(<MarketingPackageWizardV61 {...props}/>);
    expect(html).toContain("Share outreach steps");
    expect(html).toContain("Who should hear about this?");
    expect(html).toContain("Who would you like to reach?");
    expect(html).toContain("Who are you hoping to help?");
    expect(html).toContain("People I know");
    expect(html).toContain("Prospective leaders");
    expect(html).toContain("Older adults");
    expect(html).toContain("You'll decide how to share it later.");
  });
  it("shows the saved Shape highlights without implying approved offerings",()=>{
    const html=renderToStaticMarkup(<MarketingPackageWizardV61 {...props} step={2}/>);
    expect(html).toContain("Adult Learning");
    expect(html).toContain("Financial Literacy");
    expect(html).toContain("From Shape");
    expect(html).toContain("Choose what you most want people to know");
  });
  it("makes the operator choose material channels without falsely sending",()=>{
    const html=renderToStaticMarkup(<MarketingPackageWizardV61 {...props} step={4}/>);
    for(const text of ["Email","Social","Print","Text","Share link","Conversation Kit"]){
      expect(html).toContain(text);
    }
    expect(html).toContain("Which materials would you like to create?");
    expect(html).toContain("before sending or publishing anything");
  });
  it("offers story angles and editable output on the final step",()=>{
    const html=renderToStaticMarkup(<MarketingPackageWizardV61 {...props} step={5}/>);
    expect(html).toContain("Community Impact");
    expect(html).toContain("Partnership");
    expect(html).toContain("Outreach name");
    expect(html).toContain("Use suggestion for this plan");
    expect(html).toContain("Save Outreach Plan");
  });
});

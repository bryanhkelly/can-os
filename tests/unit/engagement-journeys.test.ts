import { describe, expect, it } from "vitest";
import {
  engagementJourneys, engagementJourneyList, engagementDestination,
  getEngagementJourney, mayTryIsolatedSchoolDemo,
} from "@/domain/engagement-journeys";
import {
  readEngagementContext, engagementLocalHref, engagementContactHref,
  engagementInformationHref, engagementVerifiedRoute, getJourneyById, isEngagementPath,
} from "@/domain/engagement-context";

describe("CAN Landing, Launch, Next Steps framework", () => {
  it("has one maintained finite registry for five audiences", () => {
    expect(engagementJourneyList).toHaveLength(5);
    expect(engagementJourneyList.map(item=>item.id)).toEqual([
      "start-a-school","teach-with-can","family-admissions","school-expansion","church-networks",
    ]);
    for(const journey of engagementJourneyList){
      expect(journey.overview.length).toBeGreaterThanOrEqual(3);
      expect(journey.next.choices.length).toBeGreaterThan(0);
      expect(new Set(journey.next.choices.map(choice=>choice.id)).size).toBe(journey.next.choices.length);
      expect(getJourneyById(journey.id)).toBe(journey);
      expect(engagementDestination(journey.id,"landing")).toBe("/landing/"+journey.id);
      expect(engagementDestination(journey.id,"next")).toBe("/next/"+journey.id);
    }
    expect(getEngagementJourney("not-an-audience")).toBeNull();
    expect(getJourneyById("__proto__")).toBeNull();
  });

  it("keeps untrusted campaign context bounded and never accepts URLs or secrets", () => {
    const context = readEngagementContext("?campaign=christian_schools&utm_source=partner_mail&partner=cogic&returnTo=https://evil.example&email=test%40example.com");
    expect(context).toEqual({campaign:"christian_schools",utm_source:"partner_mail",partner:"cogic"});
    expect(engagementLocalHref("/next/start-a-school","?campaign=abc&partner=cogbf"))
      .toBe("/next/start-a-school?campaign=abc&partner=cogbf");
    expect(readEngagementContext("?campaign=a%3Dhttps%3A%2F%2Fexample.com&partner=other"))
      .toEqual({campaign:undefined,utm_source:undefined,partner:undefined});
    expect(()=>engagementLocalHref("https://evil.example","")).toThrow();
    expect(()=>engagementLocalHref("//evil.example","")).toThrow();
    expect(()=>engagementLocalHref("/next?redirect=https://evil.example","")).toThrow();
  });

  it("keeps public next actions confined to fixed CAN contact and information pages", () => {
    const school=engagementJourneys["start-a-school"];
    const feedback=school.next.choices.find(choice=>choice.action==="feedback")!;
    const link=engagementContactHref(school,feedback,"?campaign=church-mail&partner=cogic");
    const target=new URL(link);
    expect(target.origin).toBe("https://can-academy.netlify.app");
    expect(target.pathname).toBe("/contact");
    expect(target.searchParams.get("intent")).toBe(feedback.id);
    expect(target.searchParams.get("campaign")).toBe("church-mail");
    expect(target.searchParams.get("partner")).toBe("cogic");
    expect(target.searchParams.has("studentId")).toBe(false);
    const info=school.next.choices.find(choice=>choice.action==="information")!;
    expect(engagementInformationHref(school, info)).toMatch(/^https:\/\/can-academy\.netlify\.app\//);
    expect(()=>engagementContactHref(school,{...feedback,id:"unauthorized"},"")).toThrow();
    expect(()=>engagementInformationHref(school,feedback)).toThrow();
  });

  it("never grants operational access through marketing intent or a demo choice", () => {
    const school=engagementJourneys["start-a-school"];
    const teacher=engagementJourneys["teach-with-can"];
    const family=engagementJourneys["family-admissions"];
    expect(engagementVerifiedRoute(school,undefined)).toBeNull();
    expect(engagementVerifiedRoute(school,"guardian")).toBeNull();
    expect(engagementVerifiedRoute(school,"registrar")).toBe("/launch/school");
    expect(engagementVerifiedRoute(school,"site_admin")).toBe("/launch/school");
    expect(engagementVerifiedRoute(teacher,"registrar")).toBeNull();
    expect(engagementVerifiedRoute(teacher,"teacher")).toBe("/launch/staff");
    expect(engagementVerifiedRoute(family,"guardian")).toBe("/launch/family");
    expect(engagementVerifiedRoute(family,"student")).toBeNull();
    expect(engagementVerifiedRoute(engagementJourneys["church-networks"],"site_admin")).toBeNull();
    expect(mayTryIsolatedSchoolDemo("start-a-school")).toBe(true);
    expect(mayTryIsolatedSchoolDemo("teach-with-can")).toBe(false);
  });

  it("reserves video only as optional content identifiers, not video hosting", () => {
    expect(isEngagementPath("/landing")).toBe(true);
    expect(isEngagementPath("/landing/start-a-school")).toBe(true);
    expect(isEngagementPath("/next/teach-with-can")).toBe(true);
    expect(isEngagementPath("/launch/school")).toBe(false);
    expect(isEngagementPath("/settings")).toBe(false);
    for(const journey of engagementJourneyList){
      for(const slot of Object.values(journey.guidance ?? {})){
        expect(slot).toMatch(/^[a-z0-9-]+$/);
        expect(slot).not.toMatch(/^https?:/);
      }
    }
  });
});

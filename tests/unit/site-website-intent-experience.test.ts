import { describe, expect, it } from "vitest";
import { renderPublicSiteHtml } from "@/domain/public-site-html";
import {
  resolvePlannedSiteExperience, resolveSiteExperienceProfile,
} from "@/domain/site-website-experience";
import {
  createSchoolWebsiteStarterContent, createSiteWebsiteEditorialBaseline,
  createSiteWebsiteStarterContent, refreshSiteWebsiteSuggestedCopy,
  emptySiteLocalContent,
} from "@/domain/site-local-content";
import type { SiteLaunchPreferences } from "@/domain/site-launch-preferences";
import type { SiteEnrollmentOpportunity } from "@/domain/site-enrollment-opportunities";

function planned(
  interestIds: SiteLaunchPreferences["interestIds"],
  audienceIds: NonNullable<SiteLaunchPreferences["audienceIds"]> = [],
): SiteLaunchPreferences {
  return { delivery: "both", interestIds, audienceIds, timingIds: [], planningVersion: 2 };
}

describe("Site Program and audience website experience", () => {
  it("uses Site planning intent before any Solution has been adopted", () => {
    expect(resolvePlannedSiteExperience(planned(["grades-6-8", "grades-9-12"], ["teens"])))
      .toBe("school");
    expect(resolvePlannedSiteExperience(planned(["adult"], ["adults"]))).toBe("training");
    expect(resolvePlannedSiteExperience(planned(["senior"], ["older_adults"]))).toBe("older-adult");
    expect(resolvePlannedSiteExperience(planned(["adult", "senior"], ["adults", "older_adults"])))
      .toBe("lifelong");
    expect(resolvePlannedSiteExperience(planned(["grades-9-12", "adult"], ["teens", "adults"])))
      .toBe("mixed");
    expect(resolvePlannedSiteExperience(planned(["summer"], ["children"]))).toBe("community");
    expect(resolvePlannedSiteExperience(planned([], []))).toBeNull();
  });

  it("does not suppress independently approved school offerings after a planning change", () => {
    const school: SiteEnrollmentOpportunity = {
      id: "approved-a", kind: "school", targetId: "approved-a",
      title: "Approved academy", description: "Reviewed", status: "explore",
    };
    expect(resolveSiteExperienceProfile([], planned(["adult", "senior"]))).toBe("lifelong");
    expect(resolveSiteExperienceProfile([school], planned(["adult", "senior"]))).toBe("mixed");
    expect(resolveSiteExperienceProfile([school])).toBe("school");
  });

  it("generates age-appropriate starters without changing school callers", () => {
    const school = createSchoolWebsiteStarterContent("Vineyard Academy");
    expect(school.localDescription).toContain("young people");
    for (const [interest, audience, target, sample] of [
      [["adult"], ["adults"], "training", "adult"],
      [["senior"], ["older_adults"], "older-adult", "older adults"],
      [["adult", "senior"], ["adults", "older_adults"], "lifelong", "adults"],
    ] as const) {
      const profile = resolvePlannedSiteExperience(
        planned([...interest], [...audience]))!;
      expect(profile).toBe(target);
      const starter = createSiteWebsiteStarterContent("Community Learning Center", profile);
      expect(starter.localDescription.toLowerCase()).toContain(sample);
      expect(starter.localDescription).not.toContain("young people");
      expect(starter.schoolVision).not.toContain("students are known");
      expect(starter.editorialBaseline?.version).toBe(1);
    }
  });

  it("refreshes only untouched old suggestions, preserving custom text and original versions", () => {
    const old = {...createSchoolWebsiteStarterContent("Community Center"),
      contentReuseConsent: "granted" as const};
    const custom = {...old, welcomeMessage: "My own message for all generations."};
    const updated = refreshSiteWebsiteSuggestedCopy(custom, "Community Center", "lifelong");
    expect(updated.heroHeadline).toBe(
      createSiteWebsiteEditorialBaseline("Community Center", "lifelong").fields.heroHeadline);
    expect(updated.localDescription).not.toContain("young people");
    expect(updated.welcomeMessage).toBe(custom.welcomeMessage);
    expect(updated.editorialBaseline).toBe(old.editorialBaseline);
    expect(updated.branding).toBe(old.branding);
    expect(custom.localDescription).toContain("young people");
    expect(refreshSiteWebsiteSuggestedCopy({...old,contentReuseConsent:"denied"},
      "Community Center","lifelong")).toEqual({...old,contentReuseConsent:"denied"});
    expect(refreshSiteWebsiteSuggestedCopy({...custom, editorialBaseline:undefined},
      "Community Center","lifelong")).toEqual({...custom, editorialBaseline:undefined});
  });

  it("changes private website headings but never opens unapproved enrollment", () => {
    const adult=planned(["adult","senior"], ["adults","older_adults"]);
    const page = {
      host: "community.example.org",
      site: {name: "Community Learning", organizationName: "Neighborhood Organization"},
      offerings: [],
      planningPreferences: adult,
      localContent: {...emptySiteLocalContent,schoolVision:"A future of community learning."},
    };
    const html=renderPublicSiteHtml(page,{localPreview:true});
    expect(html).toContain("Learning for every chapter of life");
    expect(html).toContain("Keep learning. Keep connecting.");
    expect(html).not.toContain("A community where every student has room to grow.");
    expect(html).not.toContain('action="/apply"');
    const publicHtml=renderPublicSiteHtml({...page,planningPreferences:undefined});
    expect(publicHtml).toContain("Welcome to our learning community");
    expect(publicHtml).not.toContain("Welcome to adult learning");
  });
});

import { describe, expect, it } from "vitest";
import {
  classifySiteLocalContent, createSchoolWebsiteStarterContent,
  createIllustrativeSchoolContent, emptySiteLocalContent,
  normalizeSiteLocalContent, prepareWebsiteEditorContent,
  restoreOriginalWebsiteField,
} from "@/domain/site-local-content";
import { renderPublicSiteHtml } from "@/domain/public-site-html";

describe("School website prewritten editorial copy and stable originals", () => {
  it("starts with personalized, high-quality editable suggestions without inventing programs or faith details", () => {
    const starter = createSchoolWebsiteStarterContent("Rivermere Academy");
    expect(starter.heroHeadline).toBe("A school that sees the individual. A community that helps them grow.");
    expect(starter.welcomeMessage).toContain("Thoughtful academics");
    expect(starter.localDescription).toContain("Rivermere Academy");
    expect(starter.schoolVision).toContain("students are challenged");
    expect(starter.editorialBaseline?.version).toBe(1);
    expect(starter.editorialBaseline?.fields.localDescription).toBe(starter.localDescription);
    for (const field of ["churchHistory", "denomination", "statementOfFaith",
      "localTraditions", "spiritualFormation"] as const) expect(starter[field]).toBe("");
    expect(classifySiteLocalContent(normalizeSiteLocalContent(starter)))
      .toEqual({ status: "published", flaggedFields: [] });
  });

  it("retains the original suggested wording through saves, revisions, renames and template changes", () => {
    const starter = createSchoolWebsiteStarterContent("Rivermere Academy");
    const original = starter.editorialBaseline!.fields.schoolVision;
    const customized = normalizeSiteLocalContent({
      ...starter,
      schoolVision: "Our own local story and vision.",
      welcomeMessage: "A distinctive welcome",
      branding: { ...starter.branding, templateId: "summit", paletteId: "forest" },
    });
    const reopened = prepareWebsiteEditorContent(customized, "Renamed School");
    expect(reopened.schoolVision).toBe("Our own local story and vision.");
    expect(reopened.welcomeMessage).toBe("A distinctive welcome");
    expect(reopened.branding.templateId).toBe("summit");
    expect(reopened.editorialBaseline?.fields.schoolVision).toBe(original);
    expect(reopened.editorialBaseline?.fields.localDescription).toContain("Rivermere Academy");
    const restored = restoreOriginalWebsiteField(reopened, "schoolVision");
    expect(restored.schoolVision).toBe(original);
    expect(restored.welcomeMessage).toBe("A distinctive welcome");
    expect(restored.branding).toEqual(reopened.branding);
    expect(restored.editorialBaseline).toEqual(reopened.editorialBaseline);
  });

  it("does not overwrite authored local content when opening a legacy Site without an original snapshot", () => {
    const legacy = { ...emptySiteLocalContent, localDescription: "Approved local story",
      schoolVision: "Our congregation's own school vision.",
      churchHistory: "A separately verified church account.",
    };
    const editor = prepareWebsiteEditorContent(legacy, "First School");
    expect(editor.localDescription).toBe(legacy.localDescription);
    expect(editor.schoolVision).toBe(legacy.schoolVision);
    expect(editor.churchHistory).toBe(legacy.churchHistory);
    expect(editor.editorialBaseline?.fields.localDescription).toBe("Approved local story");
    expect(editor.editorialBaseline?.fields.schoolVision).toBe("Our congregation's own school vision.");
    expect(legacy.editorialBaseline).toBeUndefined();
    const saved = normalizeSiteLocalContent(editor);
    const returned = prepareWebsiteEditorContent(saved, "New Name");
    expect(returned.editorialBaseline).toEqual(editor.editorialBaseline);
  });

  it("reset is per field only and never blanks historical or custom fields", () => {
    const content = normalizeSiteLocalContent({
      ...createSchoolWebsiteStarterContent("Rivermere Academy"),
      heroHeadline: "My own headline", localDescription: "My own story",
      churchHistory: "Our documented history", denomination: "Locally approved denomination",
    });
    const restored = restoreOriginalWebsiteField(content, "heroHeadline");
    expect(restored.heroHeadline).toBe("A school that sees the individual. A community that helps them grow.");
    expect(restored.localDescription).toBe("My own story");
    expect(restored.churchHistory).toBe("Our documented history");
    expect(restored.denomination).toBe("Locally approved denomination");
    expect(restoreOriginalWebsiteField(content, "churchHistory")).toBe(content);
    expect(restoreOriginalWebsiteField(restored, "heroHeadline")).toBe(restored);
  });

  it("rejects malicious, oversized or protected assertions smuggled into original-copy metadata", () => {
    const starter = createSchoolWebsiteStarterContent("Rivermere Academy");
    for (const text of ["Our school is fully accredited.", "<script>alert(1)</script>", "X".repeat(125)]) {
      expect(() => normalizeSiteLocalContent({
        ...starter, editorialBaseline: { version: 1, fields: {
          ...starter.editorialBaseline!.fields, heroHeadline: text,
        } },
      })).toThrow();
    }
    expect(() => normalizeSiteLocalContent({
      ...starter, editorialBaseline: { version: 1,
        fields: { ...starter.editorialBaseline!.fields, anotherField: "invalid" } as never,
      },
    })).toThrow();
  });

  it("renders a personalized headline only for approved or private-preview local content; keeps historic fallback", () => {
    const starter = createSchoolWebsiteStarterContent("Rivermere Academy");
    const page = { host: "rivermere.can-os.com", site: {
      name: "Rivermere Academy", organizationName: "Rivermere Church",
    }, offerings: [], localContent: normalizeSiteLocalContent(starter) };
    const html = renderPublicSiteHtml(page);
    expect(html).toContain("<h1>A school that sees the individual. A community that helps them grow.</h1>");
    expect(html).toContain('<p class="tag">Rivermere Academy</p>');
    expect(html).not.toContain("editorialBaseline");
    expect(html).not.toContain("<script");
    const historic = renderPublicSiteHtml({ ...page, localContent: emptySiteLocalContent });
    expect(historic).toContain("<h1>Rivermere Academy</h1>");
  });

  it("keeps synthetic sample story distinct from actual church source and official records", () => {
    const sample = createIllustrativeSchoolContent("Valor School");
    expect(sample.localDescription).toContain("Valor School");
    expect(sample.editorialBaseline).toBeDefined();
    expect(sample.churchHistory).toBe("");
    expect(sample.statementOfFaith).toBe("");
    expect(sample.spiritualFormation).toBe("");
  });
});

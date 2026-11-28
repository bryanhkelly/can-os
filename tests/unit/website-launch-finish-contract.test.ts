import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = (path: string) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");
describe("Website Studio launch completion", () => {
  const editor = source("src/routes/site-website.tsx");
  it("projects authorized persisted completion into both website routes", () => {
    expect(editor).toContain("launchModuleCompletionV61(result.data.site, result.data.overview)");
    expect(editor).toContain('active="website-brand" completion={completion}');
    for (const path of ["src/routes/launch.website.tsx", "src/routes/o.$organizationSlug.$siteSlug.website.tsx"]) {
      const route = source(path);
      expect(route).toContain("await loadWebsiteLaunchCompletion(");
      expect(route).toContain("completion={completion}");
    }
  });
  it("finishes only after a successful draft save and refresh", () => {
    expect(editor).toContain('onClick={()=>void saveDraft("finish")}>Save & Finish');
    expect(editor).toContain('if(mode!=="stay"&&outcome.status==="saved")');
    expect(editor).toContain('mode === "finish" && !allowPublication');
    expect(editor).toContain('module: "create-outreach"');
    expect(editor).toContain('operation:"draft"');
  });
  it("shares the save guard between the command and footer controls", () => {
    expect(editor).toContain("if(!canSave)return;");
    expect(editor).toContain("siteBrandConfigurationSchema.safeParse");
    expect(editor).toContain("disabled={!canSave}");
    expect(editor).toContain("saveBlockReason");
  });
});

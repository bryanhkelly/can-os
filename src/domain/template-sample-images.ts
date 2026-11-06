import manifest from "./template-sample-assets.json";
import type { SiteTemplateId } from "./site-theme";

/** Explicit template samples, never approved school-owned photography. */
export function templateSampleImage(template: SiteTemplateId, role: "hero" | "story_01"): string | null {
  const family = template === "bright-futures" ? "bright" : template;
  const asset = manifest.files.find(file => "template" in file && file.template === family &&
    file.role === role && file.preview_only === "no" && "width" in file && file.width >= 1000);
  return asset ? "/" + asset.key : null;
}

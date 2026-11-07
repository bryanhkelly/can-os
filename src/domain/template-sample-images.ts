import manifest from "./template-sample-assets.json";
import type { SiteTemplateId } from "./site-theme";

/** Explicit template samples, never approved school-owned photography. */
export function templateSampleImage(template: SiteTemplateId, role: "hero" | "story_01"): string | null {
  // These two standalone design studies deliberately use the supplied
  // Heritage/Community prototype photo families in their private gallery.
  // Public schools never receive fictional photos via this function.
  const family = template === "bright-futures" ? "bright" :
    template === "classic" ? "heritage" :
    template === "campus" ? "community" : template;
  const asset = manifest.files.find(file => "template" in file && file.template === family &&
    file.role === role && file.preview_only === "no" && "width" in file && file.width >= 1000);
  return asset ? "/" + asset.key : null;
}

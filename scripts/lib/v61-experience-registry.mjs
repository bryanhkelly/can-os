// Pure validation; callers own filesystem access and independent evidence review.
export function validateExperienceRegistry(registry, paths, readStory) {
  const errors = [], outstanding = [], seen = new Set(), known = new Set(paths);
  const layouts = registry.layouts ?? {};
  const evidenceKeys = ["responsive", "accessibility", "visual", "browserJourney"];
  const layoutSummary = Object.fromEntries(Object.keys(layouts).map(key => [key, {total:0,verified:0,outstanding:0}]));
  const storyCache = new Map();
  const nonblank = value => typeof value === "string" && value.trim().length > 0;
  function checkStory(story, owner) {
    if (typeof story !== "string" || !/^src\/(?:[A-Za-z0-9_.$-]+\/)*[A-Za-z0-9_.$-]+\.stories\.tsx?#\w+$/.test(story)) {
      errors.push("Invalid story reference: " + owner); return;
    }
    const [file, name] = story.split("#");
    if (file.split("/").some(segment => segment === "." || segment === "..")) {
      errors.push("Invalid story path: " + owner); return;
    }
    if (!storyCache.has(file)) {
      try { storyCache.set(file, readStory(file)); } catch { storyCache.set(file, null); }
    }
    const source = storyCache.get(file);
    if (typeof source !== "string") errors.push("Missing story file: " + story);
    else if (!new RegExp("\\bexport\\s+const\\s+" + name + "\\b").test(source)) errors.push("Missing story export: " + story);
  }
  if (registry.version !== 1 || registry.designSystem !== "V6.1") errors.push("Unsupported experience registry version");
  for (const layout of Object.keys(layouts)) {
    const reference = registry.layoutReferences?.[layout];
    if (!reference) errors.push("Missing layout reference: " + layout);
    else checkStory(reference, layout);
  }
  for (const row of registry.routes ?? []) {
    if (seen.has(row.path)) errors.push("Duplicate: " + row.path);
    seen.add(row.path);
    if (!known.has(row.path)) errors.push("Stale route: " + row.path);
    const validLayout = row.layout !== null && Object.hasOwn(layouts, row.layout);
    if (row.layout !== null && !validLayout) errors.push("Unknown layout: " + row.path);
    if (!["unreviewed","verified","boundary"].includes(row.review)) errors.push("Invalid review state: " + row.path);
    if (row.review === "boundary" && (row.layout !== null || !nonblank(row.boundaryReason))) errors.push("Boundary requires reason: " + row.path);
    const missing = [];
    if (row.review !== "boundary") {
      if (row.review !== "verified") missing.push("route review");
      if (!validLayout) missing.push("layout");
      if (!nonblank(row.persona)) missing.push("persona");
      if (!Array.isArray(row.stories) || !row.stories.length) missing.push("stories");
      if (!Array.isArray(row.patterns) || !row.patterns.length || !row.patterns.every(nonblank)) missing.push("patterns");
      for (const key of evidenceKeys) if (!nonblank(row.evidence?.[key])) missing.push(key);
      if (missing.length) {
        outstanding.push({path:row.path,layout:row.layout,missing});
        if (row.review === "verified") errors.push("Verified route lacks required declarations: " + row.path + " (" + missing.join(", ") + ")");
      }
      if (validLayout) {
        const summary = layoutSummary[row.layout];
        summary.total++;
        if (missing.length) summary.outstanding++; else summary.verified++;
      }
    }
    for (const story of Array.isArray(row.stories) ? row.stories : []) checkStory(story,row.path);
  }
  for (const path of paths) if (!seen.has(path)) errors.push("Unregistered route: " + path);
  return {designSystem:registry.designSystem,routes:paths.length,registered:seen.size,layoutSummary,outstanding,errors,
    note:"Registry checks references and declarations, not runtime visual or authorization evidence."};
}

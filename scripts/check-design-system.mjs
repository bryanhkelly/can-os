import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../src/components/", import.meta.url));
const files = [];
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.tsx$/.test(entry.name) && !entry.name.endsWith(".stories.tsx")) files.push(path);
  }
}
walk(root);

// Export names alone do not prove duplicate implementations: different feature
// modules may legitimately export components with the same name. Keep the
// ownership check below scoped to canonical shared contracts.
console.log(`Design component inventory: ${files.length} component files checked.`);

// Enforce a single implementation of the canonical evidence interaction widgets.
// Deliberately specialized feature controls are excluded from this check.
const canonicalEvidence = ["EvidenceUploader", "EvidenceReviewForm", "EvidenceWorkflow", "EvidenceHistory", "EvidenceStatus", "EvidenceDocumentLink", "EvidenceDocumentSummary", "EvidenceUploadSection"];
for (const name of canonicalEvidence) {
  const implementationFiles = files.filter(file => {
    const relativePath = relative(root, file).replaceAll("\\", "/");
    if (relativePath.endsWith(".stories.tsx") || relativePath.endsWith("/index.tsx")) return false;
    return new RegExp("export\\s+(?:function|const)\\s+" + name + "\\b").test(readFileSync(file, "utf8"));
  });
  const implementationPath = implementationFiles[0] && relative(root, implementationFiles[0]).replaceAll("\\", "/");
  if (implementationFiles.length !== 1 || !implementationPath?.startsWith("evidence/")) {
    console.error(`Canonical evidence component ${name} must have exactly one implementation in components/evidence`);
    process.exitCode = 1;
  }
}


// Shared evidence controls should use the existing design-system action primitive.
for (const name of ["EvidenceUploader", "EvidenceReviewForm", "EvidenceDocumentLink"]) {
  const path = join(root, "evidence", name + ".tsx");
  const source = readFileSync(path, "utf8");
  if (!source.includes('from "@/components/ui/button"') || /<button(?:\s|>)/.test(source)) {
    console.error(`${name} must use the shared Button primitive for its actions`);
    process.exitCode = 1;
  }
}


// Layout contract: the shell and page frame read the same tokens, so the sidebar
// brand divider, top bar and page titles line up for every role and page.
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
for (const token of ["--topbar-height", "--sidebar-width", "--page-gutter", "--page-pad-top", "--page-pad-bottom",
  "--content-reading", "--content-standard", "--content-wide", "--content-dashboard", "--text-3xs", "--text-2xs",
  "--text-section", "--tracking-eyebrow", "--eyebrow-color"]) {
  if (!new RegExp(token + "\\s*:").test(styles)) {
    console.error(`Design token ${token} must be defined in src/styles.css`);
    process.exitCode = 1;
  }
}
const shellContract = {
  "shell/WorkspaceSidebar.tsx": ["h-[var(--topbar-height)]"],
  "shell/WorkspaceTopBar.tsx": ["h-[var(--topbar-height)]", "px-[var(--page-gutter)]"],
  "shell/WorkspaceNavigation.tsx": ["can-shell"],
  "workspace/workspace-shell.tsx": ["PageFrame", "PageHeader"],
};
for (const [file, required] of Object.entries(shellContract)) {
  const source = readFileSync(join(root, file), "utf8");
  for (const value of required) if (!source.includes(value)) {
    console.error(`${file} must use ${value} so the shell stays on the shared layout grid`);
    process.exitCode = 1;
  }
}

// Canonical controls and surfaces must not depend on zero-radius tokens to look square.
for (const file of ["ui/button.tsx", "ui/choice.tsx", "ui/input.tsx", "ui/select.tsx", "ui/textarea.tsx", "ui/modal.tsx", "ui/table.tsx"]) {
  const source = readFileSync(join(root, file), "utf8");
  if (/(?:^|\s)rounded(?:-(?:none|sm|md|lg|xl|2xl|3xl|full|\[[^\]]+\]))?(?=\s|["'])/.test(source)) {
    console.error(`${file} must not set corner radii; canonical controls and surfaces are square`);
    process.exitCode = 1;
  }
}


// Feature-level adoption gate: protect migrated evidence interactions against
// raw native controls and corner-radius drift. Extend this manifest as feature
// components migrate; don't blanket-reject existing legacy UI in one release.
const governedFeatureControls = {
  "evidence/EvidenceUploader.tsx": {
    imports: ['@/components/ui/button', '@/components/ui/input', '@/components/ui/label'],
    forbidden: [/<input\b/, /<button\b/, /<select\b/, /<textarea\b/],
  },
  "evidence/FileSelectionField.tsx": {
    imports: ['@/components/ui/button', '@/components/ui/input', '@/components/ui/label'],
    forbidden: [/<input\b/, /<button\b/, /<select\b/, /<textarea\b/],
  },
};
const radiusUtility = /(?:^|[\s"'\x60])(?:[\w-]+:)*rounded(?:-(?:none|sm|md|lg|xl|2xl|3xl|full|\[[^\]]+\]))?(?=[\s"'\x60])/;
for (const [file, contract] of Object.entries(governedFeatureControls)) {
  const source = readFileSync(join(root, file), "utf8");
  for (const imported of contract.imports) {
    if (!source.includes(imported)) {
      console.error(`${file} must import governed design primitive ${imported}`);
      process.exitCode = 1;
    }
  }
  for (const forbidden of contract.forbidden) {
    if (forbidden.test(source)) {
      console.error(`${file} must compose shared inputs/actions instead of native controls`);
      process.exitCode = 1;
    }
  }
  if (radiusUtility.test(source)) {
    console.error(`${file} must retain V6.1 square-corner geometry`);
    process.exitCode = 1;
  }
}


// Layer 2 ownership: every directory uses the shared FilterBar composition,
// and neither the pattern nor its table may reintroduce rounded surfaces.
const sharedPatternContracts = {
  "workspace/filter-bar.tsx": ['from "@/components/ui/input"', 'from "@/components/ui/button"', 'from "@/components/ui/field"'],
  "workspace/directory-table.tsx": ['from "./filter-bar"', '<FilterBar'],
};
for (const [file, required] of Object.entries(sharedPatternContracts)) {
  const source = readFileSync(join(root, file), "utf8");
  for (const fragment of required) {
    if (!source.includes(fragment)) {
      console.error(`${file} must reuse shared application patterns: missing ${fragment}`);
      process.exitCode = 1;
    }
  }
  if (radiusUtility.test(source)) {
    console.error(`${file} must retain V6.1 square-corner geometry`);
    process.exitCode = 1;
  }
}


// Layer 2 shared workspace surfaces and migrated feature forms must remain
// square and compose canonical controls, not rebuild browser widgets.
const governedWorkspaceSurfaces = [
  "workspace/workspace-panel.tsx",
];
for (const file of governedWorkspaceSurfaces) {
  const source = readFileSync(join(root, file), "utf8");
  if (radiusUtility.test(source)) {
    console.error(`${file} must use V6.1 square-corner surfaces`);
    process.exitCode = 1;
  }
}
const governedCompletionReview = readFileSync(join(root, "learning/NoncreditCompletionReviewPanel.tsx"), "utf8");
if (!governedCompletionReview.includes('from "@/components/ui/select"') ||
    /<select\b/.test(governedCompletionReview) ||
    radiusUtility.test(governedCompletionReview)) {
  console.error("Noncredit completion review must use the shared Select and V6.1 geometry");
  process.exitCode = 1;
}


// Shared roster presentation applies to Section, Site Admin and native Class
// workflows. Only row layout is centralized; feature authority stays server-owned.
const rosterConsumers = {
  "learning/ClassRosterPanel.tsx": ["RosterList", 'from "@/components/workspace"'],
  "routes/classes.tsx": ["RosterList", 'from "@/components/workspace"'],
  "routes/class_.$classId.tsx": ["RosterList", 'from "@/components/workspace"'],
};
const srcRoot = fileURLToPath(new URL("../src/", import.meta.url));
for (const [file, required] of Object.entries(rosterConsumers)) {
  const source = readFileSync(join(srcRoot, file), "utf8");
  for (const fragment of required) {
    if (!source.includes(fragment)) {
      console.error(`${file} must compose the canonical RosterList pattern: missing ${fragment}`);
      process.exitCode = 1;
    }
  }
}
const rosterPattern = readFileSync(join(root, "workspace/roster-list.tsx"), "utf8");
if (radiusUtility.test(rosterPattern)) {
  console.error("workspace/roster-list.tsx must retain V6.1 square corners");
  process.exitCode = 1;
}

// Shared workflow history must render through the V6.1 pattern while retaining
// the domain's existing decisions, credentials and server authorization.
const statusTimeline = readFileSync(join(root, "workflow/status-timeline.tsx"), "utf8");
const completionReview = readFileSync(join(root, "learning/NoncreditCompletionReviewPanel.tsx"), "utf8");
if (radiusUtility.test(statusTimeline) || !statusTimeline.includes("StatusBadge") ||
    !statusTimeline.includes("<time") || !statusTimeline.includes('aria-label={label}')) {
  console.error("StatusTimeline must preserve square geometry, semantic time and shared statuses");
  process.exitCode = 1;
}
if (!completionReview.includes('from "@/components/workflow"') ||
    (completionReview.match(/<StatusTimeline/g) ?? []).length !== 2) {
  console.error("Completion review must use shared StatusTimeline for decision and issuance history");
  process.exitCode = 1;
}

// Govern migrated approval and notification history surfaces.
// Native checkbox and textarea elements are prohibited at the feature layer;
// primitives preserve their underlying native accessibility semantics.
const migratedApplicationSurfaces = {
  "routes/canonical.assessment-reviews.tsx": [
    'from "@/components/ui/select"', 'from "@/components/ui/textarea"',
    'from "@/components/ui/choice"', 'from "@/components/ui/button"',
  ],
  "components/communication/DeliveryHistory.tsx": [
    'from "@/components/workflow"', "<StatusTimeline",
    'from "@/components/ui/button"',
  ],
};
for (const [file, required] of Object.entries(migratedApplicationSurfaces)) {
  const source = readFileSync(join(srcRoot, file), "utf8");
  for (const fragment of required) {
    if (!source.includes(fragment)) {
      console.error(`${file} must reuse governed application primitives/patterns: missing ${fragment}`);
      process.exitCode = 1;
    }
  }
  if (/<(?:select|textarea|button|input)\b/.test(source) ||
      radiusUtility.test(source)) {
    console.error(`${file} must compose canonical controls and square V6.1 surfaces`);
    process.exitCode = 1;
  }
}

// Blueprint and Section lifecycle screens use shared status presentation.
// The latest Blueprint decision is not a complete historical event stream.
const governedLifecycleStatuses = {
  "routes/canonical.blueprint-reviews.tsx": ["StatusBadge", "item.latestDecision", "No operating permission was granted"],
  "components/launch-studio/CanonicalBlueprintWorkspace.tsx": ["StatusBadge", "review.latestReview.decision", "planning-only"],
  "components/operations/SectionLifecycleManager.tsx": ["StatusBadge", "section.active"],
};
for (const [file, required] of Object.entries(governedLifecycleStatuses)) {
  const source = readFileSync(join(srcRoot, file), "utf8");
  for (const fragment of required) {
    if (!source.includes(fragment)) {
      console.error(file + " must preserve shared status presentation and scope: missing " + fragment);
      process.exitCode = 1;
    }
  }
  if (radiusUtility.test(source)) {
    console.error(file + " violates V6.1 square-corner geometry");
    process.exitCode = 1;
  }
}

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

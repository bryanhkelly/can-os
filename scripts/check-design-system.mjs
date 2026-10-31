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
  if (implementationFiles.length !== 1 || !relative(root, implementationFiles[0]).startsWith("evidence/")) {
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

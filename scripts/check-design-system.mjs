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

const exportsByName = new Map();
function record(name, file) {
  if (!/^[A-Z][A-Za-z0-9]+$/.test(name)) return;
  const locations = exportsByName.get(name) ?? [];
  locations.push(relative(root, file));
  exportsByName.set(name, locations);
}
for (const file of files) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/export\s+(?:const|function|class)\s+([A-Z][A-Za-z0-9]+)/g)) record(match[1], file);
  for (const match of source.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const item of match[1].split(",")) {
      const spec = item.trim().replace(/^type\s+/, "");
      record((spec.split(/\s+as\s+/).at(-1) ?? "").trim(), file);
    }
  }
}
const duplicates = [...exportsByName].filter(([, locations]) => locations.length > 1);
if (duplicates.length) {
  console.error("Duplicate shared component exports detected:");
  for (const [name, locations] of duplicates) console.error(`- ${name}: ${locations.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`Design component ownership: ${files.length} files checked; no duplicate shared exports.`);
}


// Enforce a single implementation of the canonical evidence interaction widgets.
// Deliberately specialized feature controls are excluded from this check.
const canonicalEvidence = ["EvidenceUploader", "EvidenceReviewForm", "EvidenceWorkflow", "EvidenceHistory", "EvidenceStatus"];
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

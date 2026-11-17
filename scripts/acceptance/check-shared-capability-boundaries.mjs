import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// Incremental, explicit capability-boundary manifest. Do not blanket-ban
// existing legacy imports before their consumers have been migrated.
const root = fileURLToPath(new URL("../../", import.meta.url));
const governed = [
  {
    path: "src/platform/mutation.ts",
    layer: "platform",
    forbiddenImports: [
      /^@\/modules(?:\/|$)/,
      /^@\/routes(?:\/|$)/,
      /^@\/components(?:\/|$)/,
      /^@\/workers(?:\/|$)/,
    ],
    requiredImports: ["@/db/schema"],
  },
  {
    path: "src/domain/command-context.ts",
    layer: "domain",
    forbiddenImports: [
      /^@\/modules(?:\/|$)/,
      /^@\/routes(?:\/|$)/,
      /^@\/components(?:\/|$)/,
      /^@\/workers(?:\/|$)/,
    ],
  },
  {
    path: "src/modules/enrollment/enrollment-service.ts",
    layer: "capability",
    forbiddenImports: [
      /^@\/routes(?:\/|$)/,
      /^@\/components(?:\/|$)/,
    ],
    requiredImports: ["@/platform/mutation"],
  },
];

function importsIn(source) {
  // Static imports and re-exports. Dynamic imports are checked separately.
  const matches = [...source.matchAll(/\b(?:import|export)\s+(?:type\s+)?(?:[^;]*?\s+from\s+)?["']([^"']+)["']/g)];
  const dynamic = [...source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)];
  return [...matches, ...dynamic].map(match => match[1]);
}

const errors = [];
for (const rule of governed) {
  const filename = resolve(root, rule.path);
  if (!existsSync(filename)) {
    errors.push(`Missing governed capability owner: ${rule.path}`);
    continue;
  }
  const source = readFileSync(filename, "utf8");
  const dependencies = importsIn(source);
  for (const dependency of dependencies) {
    if (rule.forbiddenImports.some(pattern => pattern.test(dependency))) {
      errors.push(`${rule.path} (${rule.layer}) must not import ${dependency}`);
    }
  }
  for (const required of rule.requiredImports ?? []) {
    if (!dependencies.includes(required)) {
      errors.push(`${rule.path} must use shared dependency ${required}`);
    }
  }
}
if (errors.length) {
  for (const error of errors) console.error(`Capability boundary violation: ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Capability boundary contracts verified for ${governed.length} governed owners.`);
}

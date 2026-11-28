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
    requiredImports: ["@/platform/mutation", "@/domain/command-context"],
    forbiddenPatterns: [/\bwriteAudit\s*\(\s*tx\s*,\s*\{/],
  },
  {
    path: "src/platform/canonical-mutation.server.ts",
    layer: "platform",
    forbiddenImports: [/^@\/routes(?:\/|$)/, /^@\/components(?:\/|$)/, /^@\/modules(?:\/|$)/],
    requiredImports: ["@/db/canonical-v301"],
  },
  ...[
    "src/modules/classes/native-class-enrollment.functions.ts",
    "src/modules/enrollment/noncredit-self-enrollment.functions.ts",
    "src/modules/enrollment/noncredit-self-enrollment-withdraw.server.ts",
    "src/modules/enrollment/noncredit-self-enrollment-resume.functions.ts",
    "src/modules/enrollment/noncredit-enrollment-publication.server.ts",
    "src/modules/classes/native-class-assignment.functions.ts",
    "src/modules/classes/native-class-invitations.functions.ts",
    "src/modules/classes/native-class-lifecycle.functions.ts",
    "src/modules/enrollment/noncredit-waitlist.server.ts",
    "src/modules/classes/native-class-approvals.functions.ts",
    "src/modules/classes/native-class-repeats.server.ts",
    "src/modules/enrollment/noncredit-cohort-operations.server.ts",
    "src/modules/classes/native-class-guardian-enrollment.functions.ts",
    "src/modules/classes/native-class-sessions.functions.ts",
    "src/modules/classes/class-staff.functions.ts",
    "src/modules/classes/unified-class.functions.ts",
  ].map(path => ({
    path,
    layer: "canonical-enrollment-adapter",
    forbiddenImports: [/^@\/routes(?:\/|$)/, /^@\/components(?:\/|$)/],
    requiredImports: ["@/platform/canonical-mutation.server"],
    forbiddenPatterns: [
      /\btx\.insert\s*\(\s*(?:auditEvents|canonicalAuditEvents|domainEvents|canonicalDomainEvents)\s*\)/,
    ],
  })),
  {
    path: "src/platform/execute-command.ts",
    layer: "platform",
    forbiddenImports: [
      /^@\/modules(?:\/|$)/,
      /^@\/routes(?:\/|$)/,
      /^@\/components(?:\/|$)/,
    ],
    requiredImports: ["@/domain/command-context"],
  },
  {
    path: "src/modules/actions/resolve-action.ts",
    layer: "capability",
    forbiddenImports: [/^@\/routes(?:\/|$)/, /^@\/components(?:\/|$)/],
    requiredImports: ["@/platform/execute-command", "@/platform/mutation"],
  },
  {
    path: "src/modules/operations/site-rooms.server.ts",
    layer: "capability",
    forbiddenImports: [/^@\/routes(?:\/|$)/, /^@\/components(?:\/|$)/],
    requiredImports: ["@/platform/execute-command", "@/platform/mutation"],
  },
  {
    path: "src/modules/communication/outbound-dispatcher.server.ts",
    layer: "capability",
    forbiddenImports: [
      /^@\/routes(?:\/|$)/,
      /^@\/components(?:\/|$)/,
      /^@\/modules\/enrollment(?:\/|$)/,
      /^@\/db(?:\/|$)/,
    ],
    requiredImports: ["@/domain/outbound-retry-policy"],
  },
  {
    path: "src/modules/identity/unambiguous-adult-account.server.ts",
    layer: "capability",
    forbiddenImports: [
      /^@\/routes(?:\/|$)/,
      /^@\/components(?:\/|$)/,
      /^@\/modules\/enrollment(?:\/|$)/,
    ],
    requiredImports: ["@/db/schema", "@/domain/command-context"],
  },
  {
    path: "src/modules/enrollment/noncredit-self-enrollment-identity.server.ts",
    layer: "adapter",
    forbiddenImports: [
      /^@\/routes(?:\/|$)/,
      /^@\/components(?:\/|$)/,
    ],
    requiredImports: [
      "@/modules/identity/command-context.server",
      "@/modules/identity/unambiguous-adult-account.server",
    ],
  },
  {
    path: "src/modules/communication/school-family-alert-delivery.server.ts",
    layer: "adapter",
    forbiddenImports: [
      /^@\/routes(?:\/|$)/,
      /^@\/components(?:\/|$)/,
      /^@\/modules\/enrollment(?:\/|$)/,
    ],
    requiredImports: ["./outbound-dispatcher.server"],
  },
  {
    path: "src/modules/enrollment/noncredit-waitlist-delivery.server.ts",
    layer: "adapter",
    forbiddenImports: [
      /^@\/routes(?:\/|$)/,
      /^@\/components(?:\/|$)/,
    ],
    requiredImports: ["@/modules/communication/outbound-dispatcher.server"],
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
  for (const pattern of rule.forbiddenPatterns ?? []) {
    if (pattern.test(source)) {
      errors.push(`${rule.path} must use verified actor context in shared audit writers`);
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

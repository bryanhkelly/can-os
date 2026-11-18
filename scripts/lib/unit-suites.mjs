import { existsSync, readdirSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";

/**
 * Filename conventions, not frozen test file inventories. A new *.test.ts(x)
 * whose basename starts with one of these prefixes joins its suite automatically.
 * The broad npm test command remains authoritative for all non-E2E unit tests.
 */
export const UNIT_SUITE_PREFIXES = Object.freeze({
  safety: [
    "church-hosted-", "church-academic-", "school-opening-", "onsite-",
    "pickup-custody-", "pickup-notification-", "safeguarding-", "site-safeguarding-",
  ],
  family: ["guardian-", "conference-", "pickup-", "field-trip-", "workspace-migration-"],
  classroom: [
    "facilitated-learning", "canonical-learning-activity", "canonical-learning-release-", "classroom-",
    "notification-delivery-state", "outbound-retry-policy",
    "site-noncredit-catalog-", "noncredit-waitlist-delivery-",
  ],
  enrollment: ["noncredit-self-enrollment", "personal-can-", "one-account-", "one-person-", "core-identity-", "main-core-identity-"],
  site: [
    "site-content-", "site-first-preview", "website-studio-", "site-setup-",
    "site-enrollment-", "site-private-preview", "site-planning-",
  ],
  classes: [
    "class-", "native-class-", "unified-class", "unified-classroom-",
    "activity-evidence-",
    "canonical-objective-", "network-class-", "site-native-class-",
    "site-first-launch-", "native-facilitated-classroom-",
  ],
  network: ["network-attribution", "noncredit-self-enrollment"],
});

const testFile = /\.test\.(?:[cm]?[jt]sx?)$/;

export function isUnitTestPath(file) {
  const normalized = file.replaceAll("\\", "/");
  return (normalized.startsWith("tests/unit/") || normalized.startsWith("src/")) &&
    testFile.test(normalized);
}

export function inUnitSuite(suite, file) {
  const prefixes = UNIT_SUITE_PREFIXES[suite];
  if (!prefixes) throw new Error("Unknown unit suite: " + suite);
  if (!isUnitTestPath(file)) return false;
  return prefixes.some(prefix => basename(file).startsWith(prefix));
}

export function discoverUnitSuiteFiles(suite, root = process.cwd()) {
  if (!Object.hasOwn(UNIT_SUITE_PREFIXES, suite)) {
    throw new Error("Unknown unit suite: " + suite);
  }
  const files = [];
  for (const directory of ["tests/unit", "src"]) {
    const absolute = join(root, directory);
    if (!existsSync(absolute)) continue;
    const visit = current => {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        const full = join(current, entry.name);
        if (entry.isDirectory()) visit(full);
        else if (entry.isFile()) {
          const name = relative(root, full).split(sep).join("/");
          if (inUnitSuite(suite, name)) files.push(name);
        }
      }
    };
    visit(absolute);
  }
  return files.sort();
}

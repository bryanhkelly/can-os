#!/usr/bin/env node
/**
 * WS5 static contract check. It does NOT perform authenticated test01,
 * build, TypeScript, database migration or browser acceptance. Those are
 * separate hard release gates, never inferred from this check.
 *
 * Run: node scripts/acceptance/check-ws5-integration-contract.mjs
 * Integrated WS1/WS2 check: append --integrated
 */
import { readFileSync, existsSync } from "node:fs";
import assert from "node:assert/strict";

const read = (file) => {
  assert.ok(existsSync(file), "Missing required WS5 source: " + file);
  return readFileSync(file, "utf8");
};
const must = (source, phrase, area) =>
  assert.ok(source.includes(phrase), area + ": missing " + phrase);
const mustNot = (source, phrase, area) =>
  assert.ok(!source.includes(phrase), area + ": forbidden " + phrase);

const readModel = read("src/modules/classes/unified-class.functions.ts");
const composer = read("src/routes/canonical.classes.tsx");
const exporter = read("src/modules/programs/publisher-rollout.functions.ts");
const versionImpact = read("src/modules/programs/publisher-version-impact.functions.ts");
const authority = read("src/modules/classes/unified-class-authority.server.ts");
const publisherRules = read("src/domain/publisher-class-variation.ts");
const ownership = JSON.parse(read("docs/platform-route-contracts.json"));
const migration = read("database/canonical/v3.0.1/patch-publisher-rollout-approvals.sql");

for (const token of [
  "getUnifiedClassCourseOptions", "getNativeClassOperatorSites",
  'search:z.string().trim().max(100)',
  ".limit(pageSize+1).offset(data.cursor)",
  "exists(tx.select({id:educationOperationOrganizationRoles.id})",
  "exists(tx.select({id:educationOperationSites.id})",
  "inArray(educationOperationSites.siteId,permittedSites)",
  "placementKeys.has(row.deploymentId+\" :\"".replace(" \":\"", "\":\""), // exact scoped placement
]) must(readModel, token, "Class operator read model");
mustNot(readModel, "for(const siteId of operator.siteIds)", "bounded Course discovery");
for(const token of [
  "getPublisherRolloutTemplate", "assertCompletePortableCourseComposition",
  "inArray(educationOperationSites.siteId,siteIds)",
  'if(process.env.CAN_UNIFIED_CLASS_COMMANDS_ENABLED!=="true")',
]) must(exporter, token, "publisher export");
for(const token of [
  "localClassPolicy", "publisherClassVariationPolicy",
  "assertPublisherClassVariationAllowed",
]) must(authority + publisherRules + readModel, token, "publisher variation");
for(const token of [
  "getNativeOfferingVersionImpact", "publisherVersionsTruncated",
  "approvedAdoptions", "adoptionSites", "localClassImpact",
  "affectedClasses", "inArray(canonicalClasses.deploymentId,deploymentIds)",
]) must(versionImpact, token, "version-impact read");
for(const token of [
  "getNextPageParam:last=>last.nextCursor??undefined",
  "exactRolloutOptions=useInfiniteQuery", "getNativeClassOperatorSites",
  "getPublisherRolloutTemplate", "disabled={operatorSites.isPending||operatorSites.isError}",
]) must(composer, token, "Class composer");
const page = read("src/routes/canonical.program-operations.tsx");
must(page, 'createFileRoute("/canonical/program-operations")', "Program Operations route");
must(page, "projectedRolloutStages", "Program Operations route");
must(page, "getNativeOfferingVersionImpact", "Program Operations route");
assert.ok(ownership.routes.some(entry =>
  entry.file === "src/routes/canonical.program-operations.tsx" &&
  entry.route === "/canonical/program-operations" &&
  entry.owner === "programs"), "Missing Program Operations route ownership");

for(const table of [
  "publisher_rollout_plans","publisher_rollout_decisions",
  "operator_rollout_applications","operator_rollout_decisions",
  "operator_rollout_class_links",
]){
  must(migration, "education_v30."+table, "proposed migration");
  must(migration, "ALTER TABLE education_v30."+table+" FORCE ROW LEVEL SECURITY",
    "proposed migration");
}
must(migration, "REVOKE ALL", "proposed migration");
must(migration, "append-only", "proposed migration");
mustNot(migration, "GRANT ALL TO PUBLIC", "proposed migration");

if(process.argv.includes("--integrated")){
  // WS2 owns this source. WS5 must not fake a pass by weakening UI choices.
  must(readModel, "assertOperationalClassOfferingTerms(terms)", "WS2 publication gate");
  const contract = read("src/domain/native-class-lifecycle.ts");
  must(contract, "assertOperationalClassOfferingTerms", "WS2 publication gate");
}
process.stdout.write(
  "WS5 static contract checks passed. Typecheck, builds, authenticated RLS, "+
  "two-Site tests and independent schema/reviewer approval remain separate gates.\n"
);

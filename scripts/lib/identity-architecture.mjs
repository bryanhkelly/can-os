import { resolveSourceDependency, runtimeDependencySpecifiers, sourceDependencySpecifiers } from "./v61-component-dependencies.mjs";

/** Permanent foundations, not an allowlist of exempt files. All production
 * sources are examined. Legacy credential compatibility is separately
 * inventoried; it is not represented as compliant business logic. */
const pureDomain = /^src\/domain\/(?:domain-classification|private-account-authority|access-grant-scope|access-context|individual-staff-handoff|email-delivery-policy)\.ts$/;
const canonicalIdentity = /^src\/modules\/identity\/(?:session-grants|account-grant-reader|private-account-credential|scoped-person-account|individual-credential-issuer)\.server\.ts$/;
const fixturePattern = /valorschool\.demo|barton\.demo|f1000000-0000-4000-8000-00000000000[23]/i;
const fixtureModule = /^src\/domain\/local-demo-access(?:\.[cm]?[jt]s)?$/;

export function identityArchitectureViolations(file, parsed, ts) {
  const failures = [];
  const normalized = file.replaceAll("\\","/");
  const isDomain = pureDomain.test(normalized);
  const isCanonical = canonicalIdentity.test(normalized);
  if (isDomain) {
    for (const specifier of runtimeDependencySpecifiers(parsed,ts)) {
      const target = resolveSourceDependency(normalized,specifier);
      if ((target && /^src\/(?:components|routes|db|modules|workers|server|hooks)(?:\/|$)/.test(target)) ||
          /^(?:react|react-dom|@tanstack\/react-start|drizzle-orm|@neondatabase\/serverless|pg|postgres|cloudflare:workers)(?:\/|$)/.test(specifier))
        failures.push("identity domain policy depends on infrastructure or presentation: "+specifier);
    }
  }
  if (isCanonical || isDomain) {
    for (const specifier of sourceDependencySpecifiers(parsed,ts)) {
      const target=resolveSourceDependency(normalized,specifier);
      if (target && fixtureModule.test(target))
        failures.push("canonical identity must use domain classification, not fixture identities: "+specifier);
    }
  }
  function visit(node) {
    if ((isCanonical || isDomain) && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
        fixturePattern.test(node.text))
      failures.push("institution-specific fixture identifier in canonical identity policy");
    // Issuance belongs to one credential service. Hashing an existing presented
    // code for comparison is permitted in the credential verification handler.
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text==="hashPrivateAccessCode" &&
        normalized.startsWith("src/") &&
        !["src/modules/identity/private-account-credential.server.ts","src/modules/identity/passwordless-access.server.ts"].includes(normalized))
      failures.push("use the shared private-account credential issuance or verification service");
    ts.forEachChild(node,visit);
  }
  visit(parsed);
  return [...new Set(failures)];
}

/** An inventory is deliberately distinct from an enforcement pass: remaining
 * legacy references must be reviewed before claiming application-wide parity. */
export function identityCompatibilityReferences(parsed,ts) {
  const refs=new Set();
  function visit(node) {
    if ((ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))&&fixturePattern.test(node.text))
      refs.add("institution-specific literal");
    if (ts.isIdentifier(node)&&/^(?:LOCAL_DEMO_|CAN_DEMO_)/.test(node.text))
      refs.add("fixture credential/configuration symbol");
    if (ts.isIdentifier(node)&&/^(?:isDemoTenantOrganization|demoTenant|syntheticSchool)$/.test(node.text))
      refs.add("classification/operational boundary review");
    ts.forEachChild(node,visit);
  }
  visit(parsed);
  return [...refs].sort();
}

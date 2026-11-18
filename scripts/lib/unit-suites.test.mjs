import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { discoverUnitSuiteFiles, inUnitSuite, isUnitTestPath, UNIT_SUITE_PREFIXES } from "./unit-suites.mjs";

describe("unit-suite auto-discovery", () => {
  it("includes newly added tests based on names, not a static list", () => {
    assert.ok(inUnitSuite("classes", "tests/unit/class-announcement-attempt.test.ts"));
    assert.ok(inUnitSuite("classes", "tests/unit/class-download.test.ts"));
    assert.ok(inUnitSuite("classes", "src/domain/native-class-lifecycle.test.ts"));
    assert.ok(inUnitSuite("classes", "tests/unit/unified-classroom-player.test.tsx"));
    assert.ok(inUnitSuite("classes", "tests/unit/launch-class-cache-integration.test.ts"));
    assert.ok(inUnitSuite("classes", "tests/unit/native-offering-adoption-publication.test.ts"));
    assert.ok(inUnitSuite("classes", "tests/unit/native-adoption-readiness.test.ts"));
    assert.ok(inUnitSuite("safety", "tests/unit/safeguarding-extra-check.test.ts"));
    assert.ok(inUnitSuite("family", "tests/unit/guardian-experiences.test.tsx"));
    assert.ok(inUnitSuite("classroom", "tests/unit/noncredit-waitlist-delivery-contract.test.ts"));
    assert.ok(inUnitSuite("site", "tests/unit/site-planning-location-wiring.test.ts"));
    assert.ok(inUnitSuite("network", "tests/unit/network-attribution.test.ts"));
  });

  it("never selects integration/e2e or non-test files", () => {
    assert.equal(isUnitTestPath("tests/integration/class-announcement.test.ts"), false);
    assert.equal(inUnitSuite("classes", "tests/e2e/class-learning.test.ts"), false);
    assert.equal(inUnitSuite("classes", "src/routes/classes.tsx"), false);
  });

  it("finds every configured suite on the current checkout", () => {
    for (const suite of Object.keys(UNIT_SUITE_PREFIXES)) {
      const files = discoverUnitSuiteFiles(suite);
      assert.ok(files.length > 0, suite + " matched no test files");
      assert.deepEqual(files, [...files].sort());
      assert.ok(files.every(file => inUnitSuite(suite, file)));
    }
  });
});

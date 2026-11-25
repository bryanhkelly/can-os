import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlatformAcademicIntegrity } from "@/components/platform/PlatformAcademicIntegrity";

const checkedAt="2026-11-24T00:00:00.000Z";
describe("platform data integrity",()=>{
  it("does not show an unavailable inventory as healthy",()=>{
    const html=renderToStaticMarkup(<PlatformAcademicIntegrity integrity={{status:"unavailable",checkedAt,findings:[]}}/>);
    expect(html).toContain("Data integrity could not be checked");
    expect(html).not.toContain("No findings detected");
  });
  it("distinguishes historical evidence inventory from confirmed defects",()=>{
    const html=renderToStaticMarkup(<PlatformAcademicIntegrity integrity={{status:"available",checkedAt,findings:[
      {code:"legacy_submission_records_to_reconcile",priority:"P1",siteId:"site-1",siteName:"Example Site",affected:12},
      {code:"native_submission_course_mismatch",priority:"P0",siteId:"site-1",siteName:"Example Site",affected:2},
    ]}}/>);
    expect(html).toContain("Legacy submission inventory");
    expect(html).toContain("Native submission Course mismatch");
    expect(html).toContain("not proven missing or corrupt records");
    expect(html).toContain("P0 finding groups");
  });
  it("uses governed geography and preserves the read-only SQL contract",()=>{
    const query=readFileSync(new URL("../../scripts/acceptance/academic-integrity-inventory.sql",import.meta.url),"utf8");
    expect(query).toContain("public.site_geography_versions");
    expect(query).toContain("v.superseded_at IS NULL");
    expect(query).not.toMatch(/\b(?:INSERT INTO|UPDATE public\.|DELETE FROM|DROP TABLE|ALTER TABLE)\b/i);
    expect(query).toContain("a.person_id=g.person_id");
  });
});

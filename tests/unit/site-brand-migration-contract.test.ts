import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Non-executing migration contract, independent of CI/Netlify connectivity.
 * Runtime migration checks remain required before deployment. */
const sql=readFileSync(new URL("../../drizzle/0090_brand_current_and_published_backfill.sql",import.meta.url),"utf8");

describe("canonical Site Brand cutover",()=>{
  it("pins every published Site or aborts before the cutover commits",()=>{
    expect(sql).toContain("publication.status = 'published'");
    expect(sql).toContain("published_source_count > 0");
    expect(sql).toContain("RAISE EXCEPTION");
    expect(sql).toContain("publication.brand_version_id IS NULL");
    expect(sql).toContain("publication.website_content_revision IS NULL");
  });
  it("finds the last real published copy even if its Brand JSON is absent",()=>{
    expect(sql).toContain("revision.status='published'");
    expect(sql).toContain("jsonb_typeof(revision.content->'branding')");
    expect(sql).toContain("older.content->'branding'");
    expect(sql).toContain("'{}'::jsonb");
    expect(sql).toContain("website_content_revision=source_row.revision");
  });
  it("does not manufacture a creator or Brand version for a Site with no source record",()=>{
    expect(sql).toContain("source_row.created_by_person_id");
    expect(sql).toContain("FROM site_local_content_versions revision");
    expect(sql).toContain("first authorized Website & Brand save");
    expect(sql).not.toMatch(/DELETE\s+FROM\s+sites/i);
    expect(sql).not.toMatch(/DROP\s+TABLE\s+site_brand_versions/i);
  });
  it("preserves published Brand separately from newer saved Brand",()=>{
    expect(sql).toContain("source_row.source='published'");
    expect(sql).toContain("UPDATE sites SET current_brand_version_id=");
    expect(sql).toContain("UPDATE site_publications SET");
    expect(sql).toContain("ORDER BY site_id, priority");
  });
});

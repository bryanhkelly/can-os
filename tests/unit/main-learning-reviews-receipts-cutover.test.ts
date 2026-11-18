import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const read=(path:string)=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");

describe("shared asset review and waitlist receipt storage",()=>{
  it("maps both original production tables directly to public",()=>{
    const learning=read("src/db/canonical-v301/learning.ts");
    const delivery=read("src/db/canonical-v301/noncredit-waitlist-delivery.ts");
    expect(learning).toContain('publishedAssetReviews = pgTable("published_asset_reviews"');
    expect(learning).not.toContain('publishedAssetReviews = educationV30.table("published_asset_reviews"');
    expect(delivery).toContain('noncreditWaitlistEmailDeliveries=pgTable(');
    expect(delivery).not.toContain('noncreditWaitlistEmailDeliveries=educationV30.table(');
  });

  it("preserves forced RLS, indexes, and original tables in guarded migration",()=>{
    const sql=read("database/production/2026-11-17-consolidate-learning-reviews-and-waitlist-receipts.sql");
    expect(sql).toContain("ALTER TABLE education_v30.published_asset_reviews SET SCHEMA public");
    expect(sql).toContain("ALTER TABLE education_v30.noncredit_waitlist_email_deliveries SET SCHEMA public");
    expect(sql).toContain("relforcerowsecurity");
    expect(sql).toContain("LOCK TABLE education_v30");
    expect(sql).not.toMatch(/\bDROP TABLE\b|\bDISABLE ROW LEVEL SECURITY\b|\bINSERT INTO\b/i);
  });

  it("keeps existing native learning security acceptance after public relocation",()=>{
    const gate=read("scripts/check-canonical-v301-ddl.mjs");
    expect(gate.match(/n\.nspname='public' AND c\.relname='published_asset_reviews'/g)).toHaveLength(2);
    const parity=read("scripts/acceptance/check-main-learning-reviews-receipts.mjs");
    expect(parity).toContain("CAN_MAIN_LEARNING_REVIEWS_RECEIPTS_CHECK");
    expect(parity).toContain("pg_get_serial_sequence(");
    expect(parity).toContain("owner_policies");
    expect(parity).not.toMatch(/sql`\s*(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)\b/i);
  });
});

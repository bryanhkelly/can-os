import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

describe("0077 private website draft migration", () => {
  it("admits private draft, published and held statuses but rejects any other status", async () => {
    const db = new PGlite();
    try {
      await db.exec(`CREATE TABLE site_local_content_versions(
        revision integer PRIMARY KEY, status text NOT NULL,
        CONSTRAINT site_local_content_status_ck CHECK (status IN ('published','review_required'))
      );`);
      await db.exec("INSERT INTO site_local_content_versions(revision,status) VALUES(1,'published')");
      const migration = readFileSync(
        new URL("../../drizzle/0077_website_private_drafts.sql", import.meta.url), "utf8");
      await db.exec(migration.replaceAll("--> statement-breakpoint",""));
      await db.exec(`INSERT INTO site_local_content_versions(revision,status)
        VALUES(2,'draft'),(3,'review_required'),(4,'published')`);
      await expect(db.exec("INSERT INTO site_local_content_versions(revision,status) VALUES(5,'invalid')"))
        .rejects.toThrow();
      const rows = await db.query<{revision:number,status:string}>(
        "SELECT revision,status FROM site_local_content_versions ORDER BY revision");
      expect(rows.rows.map(x=>x.status)).toEqual([
        "published", "draft", "review_required", "published",
      ]);
    } finally {
      await db.close();
    }
  });
});

import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

describe("0078 US jurisdiction reference catalog", () => {
  it("seeds 50 states, DC and five territories without creating legal approval", async () => {
    const db = new PGlite();
    try {
      await db.exec(`CREATE TABLE jurisdictions(
        id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        code text NOT NULL,
        country_code text NOT NULL, region_code text NOT NULL,
        name text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
      )`);
      // Existing records must retain their identity instead of being duplicated.
      await db.exec(`INSERT INTO jurisdictions(code,country_code,region_code,name)
        VALUES ('TX-LEGACY','US','TX','Texas')`);
      const sql = readFileSync(
        new URL("../../drizzle/0078_jurisdiction_reference_catalog.sql", import.meta.url), "utf8");
      await db.exec(sql);
      await db.exec(sql);
      const all = await db.query<{count:number}>(
        "SELECT count(*)::integer AS count FROM jurisdictions WHERE country_code='US'");
      expect(all.rows[0]?.count).toBe(56);
      const texas = await db.query<{code:string}>(
        "SELECT code FROM jurisdictions WHERE country_code='US' AND lower(name)='texas'");
      expect(texas.rows).toEqual([{code:"TX-LEGACY"}]);
      const territories = await db.query<{code:string}>(
        "SELECT code FROM jurisdictions WHERE region_code IN ('DC','AS','GU','MP','PR','VI') ORDER BY code");
      expect(territories.rows.map(row=>row.code)).toEqual([
        "US-AS","US-DC","US-GU","US-MP","US-PR","US-VI",
      ]);
      expect(sql).not.toMatch(/\b(approve|activate|publish)\s+(program|school)/i);
    } finally {
      await db.close();
    }
  });
});

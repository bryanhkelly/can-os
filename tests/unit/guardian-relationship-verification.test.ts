import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";

const dialect=new PgDialect();
function query(access:"academic"|"enrollment"|"attendance-excuse"|"relationship"){
  return dialect.sqlToQuery(guardianRelationshipPredicate({
    guardianPersonId:"guardian-person",access,
  })).sql;
}

describe("verified guardian relationship SQL enforcement",()=>{
  it.each(["academic","enrollment","attendance-excuse"] as const)(
    "requires independently verified relationships for %s",access=>{
      const sql=query(access);
      expect(sql).toContain("verification");
      expect(sql).toContain("verified");
      expect(sql).toContain("guardian_relationships");
    },
  );
  it("keeps relationship-only staff discovery separate from academic permission",()=>{
    expect(query("relationship")).not.toContain("verification");
  });
});

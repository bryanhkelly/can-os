import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { authorizedProgramWhere } from "@/modules/identity/authorized-program-query.server";

const dialect = new PgDialect();

describe("database-filtered verified Program scope", () => {
  it("constrains Org and original Site grant before Program rows are fetched",()=>{
    const {sql,params}=dialect.sqlToQuery(
      authorizedProgramWhere(["org-a"],["site-one"]));
    expect(sql).toMatch(/organization_id/);
    expect(sql).toMatch(/site_id/);
    expect(params).toEqual(["org-a","site-one"]);
  });
  it("preserves intentionally Organization-wide grants without inventing a Site",()=>{
    const {sql,params}=dialect.sqlToQuery(
      authorizedProgramWhere(["org-wide"],[]));
    expect(sql).toMatch(/organization_id/);
    expect(sql).not.toMatch(/site_id/);
    expect(params).toEqual(["org-wide"]);
  });
  it("rejects missing Organization authority",()=>{
    expect(()=>authorizedProgramWhere([],["site-one"])).toThrow("verified Organization");
  });
});

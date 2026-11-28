import {describe,expect,it} from "vitest";
import {PgDialect} from "drizzle-orm/pg-core";
import {sql} from "drizzle-orm";
import {nativeClassWorkRows,nativeOverdueWorkPredicate} from "@/modules/classes/native-class-work-query.server";

const dialect=new PgDialect();
const classA="10000000-0000-4000-8000-000000000001";
const classB="10000000-0000-4000-8000-000000000002";

describe("native teacher assignment work query",()=>{
  it("requires a nonempty authorized Class population",()=>{
    expect(()=>nativeClassWorkRows([])).toThrow("Authorized Class IDs required");
  });
  it("binds Class IDs and joins the exact active native Course Attempt and official assignment",()=>{
    const query=dialect.sqlToQuery(nativeClassWorkRows([classA,classB]));
    expect(query.params).toEqual([classA,classB]);
    expect(query.sql).toContain("ce.class_id IN ($1::uuid, $2::uuid)");
    expect(query.sql).toContain("ca.class_enrollment_id=ce.id");
    expect(query.sql).toContain("ca.id=ce.course_attempt_id");
    expect(query.sql).toContain("ca.deployment_id=c.deployment_id");
    expect(query.sql).toContain("ca.adoption_id=c.adoption_id");
    expect(query.sql).toContain("ca.offering_version_id=c.offering_version_id");
    expect(query.sql).toContain("o.id=a.official_assignment_version_id");
    expect(query.sql).toContain("s.course_attempt_id=ca.id");
    expect(query.sql).toContain("ce.status='active'");
    expect(query.sql).toContain("ca.status='active'");
    expect(query.sql).toContain("ca.section_id IS NULL");
    expect(query.sql).not.toContain(classA);
  });
  it("shares one deadline and status predicate for dashboard and queue",()=>{
    const query=dialect.sqlToQuery(sql`SELECT * FROM (${nativeClassWorkRows([classA])}) work WHERE ${nativeOverdueWorkPredicate}`);
    expect(query.sql).toContain("due_at<now()");
    expect(query.sql).toContain("submission_id IS NULL OR submission_status IN ('assigned','returned')");
    expect(query.params).toEqual([classA]);
  });
});

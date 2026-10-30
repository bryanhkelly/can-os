import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { people } from "@/db/schema/identity";
import { verifiedPrivateDocumentPredicate } from "@/domain/private-document";

const dialect = new PgDialect();

describe("verified private document eligibility", () => {
  it("requires matching subject, category, private provider, verification and unexpired storage", () => {
    const query = dialect.sqlToQuery(verifiedPrivateDocumentPredicate({
      subjectType: "assessment", subjectId: "assessment-1", category: "assignment_submission",
      uploadedByPersonId: "student-1",
    }));
    expect(query.params).toEqual(["assessment", "assessment-1", "assignment_submission", "student-1", "cloudflare_r2"]);
    expect(query.sql).toContain('"documents"."verified_at" is not null');
    expect(query.sql).toContain('"documents"."expires_at" is null');
    expect(query.sql).toContain('"documents"."expires_at" > now()');
    expect(query.sql).not.toContain("sensitivity_tier");
  });

  it("supports shared standard resources without incorrectly requiring viewer ownership", () => {
    const query = dialect.sqlToQuery(verifiedPrivateDocumentPredicate({
      subjectType: "course_template_version", subjectId: "version-1",
      category: "class_resource", sensitivityTier: "standard",
    }));
    expect(query.params).toEqual(["course_template_version", "version-1", "class_resource", "standard", "cloudflare_r2"]);
    expect(query.sql).not.toContain("uploaded_by_person_id");
  });

  it("supports correlated subjects and uploaders without binding columns as values", () => {
    const query = dialect.sqlToQuery(verifiedPrivateDocumentPredicate({
      subjectType: "person", subjectId: people.id, category: "profile_photo", uploadedByPersonId: people.id,
    }));
    expect(query.params).toEqual(["person", "profile_photo", "cloudflare_r2"]);
    expect(query.sql).toContain('"documents"."subject_id" = "people"."id"');
    expect(query.sql).toContain('"documents"."uploaded_by_person_id" = "people"."id"');
  });
});

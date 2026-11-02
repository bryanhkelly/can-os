import { describe, expect, it } from "vitest";
import { previewRosterClasses } from "./oneroster-class-preview";

describe("OneRoster class preview", () => {
  it("keeps incomplete and invalid CSV editable", () => {
    expect(previewRosterClasses("")).toEqual([]);
    expect(previewRosterClasses("not-a-valid-header\nvalue")).toEqual([]);
  });

  it("preserves sourced IDs from canonical CSV parsing", () => {
    const rows = previewRosterClasses("sourcedId,title,courseSourcedId,classCode,schoolSourcedId\nclass-1,Algebra I,course-1,MATH101,school-1");
    expect(rows.map((row) => row.sourcedId)).toEqual(["class-1"]);
  });
});

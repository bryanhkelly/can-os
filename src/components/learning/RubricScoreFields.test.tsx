import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RubricScoreFields } from "./RubricScoreFields";

const criteria = [{ id: "reasoning", label: "Reasoning", maxPoints: 5 }];

describe("RubricScoreFields", () => {
  it("displays decimal-string assessment totals without coercion", () => {
    const html = renderToStaticMarkup(
      <RubricScoreFields
        criteria={criteria}
        values={{ reasoning: "3" }}
        onChange={() => {}}
        total={3}
        pointsPossible="5.00"
      />,
    );
    expect(html).toContain("Total: ");
    expect(html).toContain("5.00");
    expect(html).toContain('value="3"');
  });

  it("does not invent a total for incomplete scoring", () => {
    const html = renderToStaticMarkup(
      <RubricScoreFields
        criteria={criteria}
        values={{}}
        onChange={() => {}}
        total={null}
        pointsPossible={null}
      />,
    );
    expect(html).toContain("Total:");
    expect(html).toContain("—");
  });
});

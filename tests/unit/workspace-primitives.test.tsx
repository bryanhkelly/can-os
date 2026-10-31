import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusBadge, WorkspacePanel, type StatusTone } from "@/components/workspace";

describe("workspace design primitives", () => {
  it.each([
    ["neutral", "bg-muted"],
    ["info", "border-info/40"],
    ["attention", "border-warning/50"],
    ["success", "border-success/50"],
    ["danger", "border-danger/50"],
  ] as Array<[StatusTone, string]>)("renders %s status with semantic color, an icon, and text", (tone, className) => {
    const html = renderToStaticMarkup(<StatusBadge tone={tone}>Recorded state</StatusBadge>);
    expect(html).toContain(className);
    expect(html).toContain("Recorded state");
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("border-amber");
    expect(html).not.toContain("border-emerald");
  });

  it("uses a neutral status by default", () => {
    const html = renderToStaticMarkup(<StatusBadge>Draft</StatusBadge>);
    expect(html).toContain("bg-muted");
    expect(html).toContain("Draft");
  });

  it("keeps panel titles, descriptions, actions, and content in one labelled surface", () => {
    const html = renderToStaticMarkup(
      <WorkspacePanel title="Review record" description="Authorized context" actions={<button>Review</button>}>
        <p>Evidence</p>
      </WorkspacePanel>,
    );
    expect(html).toContain('aria-label="Review record"');
    expect(html).toContain("Authorized context");
    expect(html).toContain("Review");
    expect(html).toContain("Evidence");
  });

  it("retains the approved semantic foundation without decorative role hues", () => {
    const css = readFileSync(new URL("../../src/styles.css", import.meta.url), "utf8");
    for (const declaration of [
      "--primary: #1769ef",
      "--foreground: #101d39",
      "--muted-foreground: #52627c",
      "--background: #f6f8fb",
      "--border: #e2e8f0",
      "--success: #16845b",
      "--warning: #b86b00",
      "--danger: #c93232",
      "--info: #1769ef",
    ]) expect(css).toContain(declaration);
    expect(css).not.toContain("[data-workspace-category=");
  });
});

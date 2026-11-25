import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FormSection, StatCard, StatusBadge, WorkspaceNotice, WorkspacePanel, type StatusTone } from "@/components/workspace";

describe("workspace design primitives", () => {
  it("preserves the named form section and allows nested heading levels", () => {
    const html = renderToStaticMarkup(<WorkspacePanel title="Authorization">
      <FormSection headingLevel="h3" title="Required information" description="Review the agreement">
        <p>Agreement details</p>
      </FormSection>
    </WorkspacePanel>);
    expect(html).toMatch(/<h2[^>]*>Authorization<\/h2>/);
    const heading = html.match(/<h3 id="([^"]+)"[^>]*>Required information<\/h3>/);
    expect(heading).not.toBeNull();
    expect(html).toContain('aria-labelledby="' + heading?.[1] + '"');
    expect(html).toContain("Review the agreement");
    const standalone = renderToStaticMarkup(<FormSection title="Details"><p>Content</p></FormSection>);
    expect(standalone).toMatch(/<h2[^>]*>Details<\/h2>/);
  });

  it("only exposes a labelled dismissal control when the caller opts in", () => {
    const notice = renderToStaticMarkup(<WorkspaceNotice>Session information</WorkspaceNotice>);
    expect(notice).not.toContain("<button");
    const dismissible = renderToStaticMarkup(<WorkspaceNotice onDismiss={() => {}}
      dismissLabel="Dismiss demo information">Session information</WorkspaceNotice>);
    expect(dismissible).toContain('aria-label="Dismiss demo information"');
    expect(dismissible).toContain('type="button"');
    expect(dismissible).toContain('role="status"');
    const error = renderToStaticMarkup(<WorkspaceNotice tone="danger">Session unavailable</WorkspaceNotice>);
    expect(error).toContain('role="alert"');
    expect(error).not.toContain("<button");
  });

  it("announces attention as a warning without styling it as a failure", () => {
    const html = renderToStaticMarkup(<WorkspaceNotice tone="attention">
      A saved command needs its display refreshed.
    </WorkspaceNotice>);
    expect(html).toContain('role="alert"');
    expect(html).toContain("border-warning/50");
    expect(html).not.toContain("border-danger/50");
    expect(html).toContain("A saved command needs its display refreshed.");
  });

  it("supports block content in accessible notices without nested paragraphs", () => {
    const html = renderToStaticMarkup(<WorkspaceNotice tone="success">
      <p>Saved successfully</p><p>Refresh may still be pending</p>
    </WorkspaceNotice>);
    expect(html).toMatch(/^<div\b/);
    expect(html).toMatch(/<div[^>]*><p>Saved successfully<\/p>/);
    expect(html).not.toContain("<span class=\"min-w-0 flex-1\"><p>");
    expect(html).toContain("<p>Refresh may still be pending</p>");
  });

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

  it("supports nested panel headings and named regions", () => {
    const html = renderToStaticMarkup(<WorkspacePanel title="Lifecycle"><WorkspacePanel headingLevel="h3" title="Algebra II">Section record</WorkspacePanel></WorkspacePanel>);
    expect(html).toContain('aria-label="Algebra II"');
    expect(html).toMatch(/<h2[^>]*>Lifecycle<\/h2>/);
    expect(html).toMatch(/<h3[^>]*>Algebra II<\/h3>/);
  });

  it("keeps informational metrics still and gives linked metrics explicit hover and keyboard feedback", () => {
    const informational = renderToStaticMarkup(<StatCard label="Applications" value="18" />);
    expect(informational).not.toContain("hover:shadow-md");
    expect(informational).not.toContain("focus-visible:ring-2");

    const interactive = renderToStaticMarkup(<StatCard asChild label="Needs review" value="4"><a href="/review" /></StatCard>);
    expect(interactive).toContain("hover:border-primary");
    expect(interactive).not.toContain("hover:shadow-md");
    expect(interactive).toContain('href="/review"');
    expect(interactive).toMatch(/^<a /);
    expect(interactive).not.toContain("<div");
    expect(interactive).toContain("focus-visible:ring-2");
    const button = renderToStaticMarkup(<StatCard asChild label="Review" value="4"><button type="button" /></StatCard>);
    expect(button).toMatch(/^<button /);
    expect(button).toContain("Review");
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

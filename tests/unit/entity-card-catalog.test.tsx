import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EntityCard } from "@/components/workspace/record-layout";

describe("V6.1 EntityCard directory navigation", () => {
  it("supports one full-card route link with scoped facts and no nested links", () => {
    const html = renderToStaticMarkup(<EntityCard
      title="After-school digital skills" subtitle="Community center · Spring"
      meta={<span>$25.00 starting price · 2 enrollment options</span>}
      openLabel="View details and register"
      renderLink={({className,children}) =>
        <a href="/enrichment/season-1" className={className}>{children}</a>}>
      <p>January through March</p>
    </EntityCard>);
    expect(html).toContain('href="/enrichment/season-1"');
    expect((html.match(/<a\b/g) ?? []).length).toBe(1);
    expect(html).toContain("After-school digital skills");
    expect(html).toContain("starting price");
    expect(html).toContain("View details and register");
    expect(html).not.toMatch(/\brounded(?:-[\w-]+)?\b/);
  });

  it("uses the canonical card for each enrichment offering without a redundant CTA link", () => {
    const source = readFileSync(new URL("../../src/routes/enrichment.tsx", import.meta.url), "utf8");
    expect(source).toContain("<EntityCard");
    expect(source).toContain("renderLink=");
    expect(source).toContain('openLabel="View details and register"');
    expect(source).not.toContain("<article");
    expect((source.match(/to="\/enrichment\/\$seasonId"/g) ?? []).length).toBe(1);
  });
});

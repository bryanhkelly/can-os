import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DirectoryPagination } from "../../src/components/workspace/directory-pagination";

const base = { label: "Enrollments", page: 2, pageSize: 20, totalItems: 45, onPageChange: () => undefined };

describe("DirectoryPagination", () => {
  it("renders an accessible page navigation and accurate range", () => {
    const html = renderToStaticMarkup(<DirectoryPagination {...base} />);
    expect(html).toContain('aria-label="Enrollments pagination"');
    expect(html).toContain("Showing 21–40 of 45");
    expect(html).toContain("2 / 3");
  });

  it("disables previous on the first page and next on the last", () => {
    const first = renderToStaticMarkup(<DirectoryPagination {...base} page={1} />);
    const last = renderToStaticMarkup(<DirectoryPagination {...base} page={3} />);
    expect(first).toMatch(/disabled=""[^>]*>Previous/);
    expect(last).toMatch(/disabled=""[^>]*>Next/);
  });

  it("handles empty records without a negative range", () => {
    const html = renderToStaticMarkup(<DirectoryPagination {...base} page={1} totalItems={0} />);
    expect(html).toContain("No results");
    expect(html).toContain("1 / 1");
  });
});

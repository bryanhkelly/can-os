import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DirectoryWindowPagination } from "../../src/components/workspace/directory-window-pagination";

describe("DirectoryWindowPagination", () => {
  it("does not invent total counts when an authorized server returns only hasMore", () => {
    const html=renderToStaticMarkup(<DirectoryWindowPagination label="Evidence reviews"
      pageIndex={2} hasMore onPageChange={()=>undefined}/>);
    expect(html).toContain('aria-label="Evidence reviews pagination"');
    expect(html).toContain("Page 3");
    expect(html).not.toContain(" of ");
  });
  it("supports contextual labels without revealing unknown totals", () => {
    const html = renderToStaticMarkup(<DirectoryWindowPagination label="Blueprint review history"
      pageIndex={2} hasMore previousLabel="Newer" nextLabel="Older" onPageChange={()=>undefined}/>);
    expect(html).toContain('aria-label="Blueprint review history pagination"');
    expect(html).toContain("Newer</button>");
    expect(html).toContain("Older</button>");
    expect(html).toContain("Page 3");
    expect(html).not.toContain(" of ");
  });
  it("locks previous on page zero and next on the final page", () => {
    const first=renderToStaticMarkup(<DirectoryWindowPagination label="Evidence reviews"
      pageIndex={0} hasMore onPageChange={()=>undefined}/>);
    const last=renderToStaticMarkup(<DirectoryWindowPagination label="Evidence reviews"
      pageIndex={5} hasMore={false} onPageChange={()=>undefined}/>);
    expect(first).toMatch(/disabled=""[^>]*>Previous/);
    expect(last).toMatch(/disabled=""[^>]*>Next/);
  });
});

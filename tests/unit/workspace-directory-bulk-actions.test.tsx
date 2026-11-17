import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DirectoryBulkActions } from "../../src/components/workspace/directory-bulk-actions";

describe("DirectoryBulkActions", () => {
  it("does not expose actions without a selection", () => {
    const html=renderToStaticMarkup(<DirectoryBulkActions label="Rosters"
      selectedKeys={new Set()} actions={[{id:"export",label:"Export",onClick:()=>undefined}]}
      onClear={()=>undefined}/>);
    expect(html).toBe("");
  });
  it("announces selection and renders permitted commands", () => {
    const html=renderToStaticMarkup(<DirectoryBulkActions label="Rosters"
      selectedKeys={new Set(["a","b"])} actions={[{id:"export",label:"Export",onClick:()=>undefined}]}
      onClear={()=>undefined}/>);
    expect(html).toContain('aria-label="Rosters bulk actions"');
    expect(html).toContain("2 records selected");
    expect(html).toContain("Clear selection");
    expect(html).toContain("Export");
  });
  it("disables commands during a pending mutation", () => {
    const html=renderToStaticMarkup(<DirectoryBulkActions label="Rosters"
      selectedKeys={new Set(["a"])} pending
      actions={[{id:"archive",label:"Archive",destructive:true,onClick:()=>undefined}]}
      onClear={()=>undefined}/>);
    expect(html).toContain("1 record selected");
    expect(html.match(/disabled=""/g)?.length).toBe(2);
  });
});

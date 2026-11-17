import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DirectoryTable, type DirectoryColumn } from "../../src/components/workspace/directory-table";

type Row = { id: string; name: string; editable: boolean };
const rows: Row[] = [
  { id: "one", name: "One", editable: true },
  { id: "two", name: "Two", editable: false },
];
const columns: DirectoryColumn<Row>[] = [{ id: "name", title: "Name", render: row => row.name, sortable: true }];
const base = { label: "Sites", caption: "Site directory", rows, columns, rowKey: (row: Row) => row.id };

describe("DirectoryTable reusable workspace pattern", () => {
  it("preserves accessible captions and server-controlled sorting", () => {
    const html = renderToStaticMarkup(<DirectoryTable {...base}
      sort={{ column: "name", direction: "ascending" }} onSort={() => undefined} />);
    expect(html).toContain('aria-label="Sites"');
    expect(html).toContain('aria-sort="ascending"');
    expect(html).toContain("Site directory");
  });

  it("does not render unauthorized actions", () => {
    const html = renderToStaticMarkup(<DirectoryTable {...base} rowActions={[{
      id: "edit", label: "Edit Site", allowed: row => row.editable, onClick: () => undefined,
    }]} />);
    expect(html.match(/Edit Site/g)).toHaveLength(1);
  });

  it("marks selected rows and provides accessible selection controls", () => {
    const html = renderToStaticMarkup(<DirectoryTable {...base}
      selectedKeys={new Set(["one"])} onSelectionChange={() => undefined} />);
    expect(html).toContain('aria-label="Select page"');
    expect(html).toContain('aria-label="Deselect row one"');
    expect(html).toContain('aria-label="Select row two"');
  });

  it("does not expose selection controls in read-only mode", () => {
    const html = renderToStaticMarkup(<DirectoryTable {...base} selectedKeys={new Set(["one"])} />);
    expect(html).not.toContain('aria-label="Select page"');
  });
  it("keeps pagination available when a server window is empty", () => {
    const html = renderToStaticMarkup(<DirectoryTable {...base} rows={[]}
      empty={<p>No results on this page</p>}
      pagination={<nav aria-label="Server pages"><button>Previous page</button></nav>} />);
    expect(html).toContain("No results on this page");
    expect(html).toContain("Previous page");
    expect(html).not.toContain("<table");
  });

  it("shows a controlled bulk action only when rows are selected", () => {
    const props = {
      ...base,
      bulkActions: [{ id: "export", label: "Export permitted rows", onClick: () => undefined }],
      onSelectionChange: () => undefined,
    };
    const empty = renderToStaticMarkup(<DirectoryTable {...props} selectedKeys={new Set<string>()} />);
    const selected = renderToStaticMarkup(<DirectoryTable {...props} selectedKeys={new Set(["one"])} />);
    expect(empty).not.toContain("Export permitted rows");
    expect(selected).toContain("Export permitted rows");
    expect(selected).toContain("1 record selected");
  });

});

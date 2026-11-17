import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ActionFooter } from "@/components/workspace/action-footer";
import { FormActions } from "@/components/workspace/form-page";
import { ActionDialog } from "@/components/workspace/action-dialog";

describe("V6.1 shared action layout", () => {
  it("renders a neutral footer without creating another form", () => {
    const html = renderToStaticMarkup(
      <ActionFooter layout="dialog"><button type="button">Cancel</button><button type="submit">Confirm</button></ActionFooter>,
    );
    expect(html).toContain('data-action-footer="dialog"');
    expect(html).toContain('data-dialog-actions=""');
    expect(html).not.toContain("data-form-actions");
    expect(html).not.toContain("<form");
    expect(html.indexOf("Cancel")).toBeLessThan(html.indexOf("Confirm"));
  });

  it("preserves submit-first form actions and a cancel navigation link", () => {
    const html = renderToStaticMarkup(<FormActions submitLabel="Create term"
      pendingLabel="Creating term…" pending={false} cancel={<a href="/terms">Cancel</a>}/>);
    expect(html).toContain('data-action-footer="form"');
    expect(html).toContain('data-form-actions=""');
    expect(html).toContain('type="submit"');
    expect(html).toContain('href="/terms"');
    expect(html.indexOf("Create term")).toBeLessThan(html.indexOf("Cancel"));
    expect(html).not.toContain("<form");
  });

  it("locks pending form submission and uses the supplied pending label", () => {
    const html = renderToStaticMarkup(<FormActions submitLabel="Publish program"
      pendingLabel="Publishing…" pending cancel={<a href="/programs">Cancel</a>}/>);
    expect(html).toContain("Publishing…");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('disabled=""');
    expect(html).not.toContain(">Publish program</button>");
  });

  it("keeps modal confirmation secondary-first, with labelled reason content", () => {
    const html = renderToStaticMarkup(<ActionDialog open
      title="Approve evidence?" description="Independent review is required."
      confirmLabel="Approve" onClose={vi.fn()} onConfirm={vi.fn()}>
      <p>Authoritative review note</p>
    </ActionDialog>);
    expect(html).toContain('data-action-footer="dialog"');
    expect(html).toContain('data-dialog-actions=""');
    expect(html).toContain('type="submit"');
    expect(html.indexOf("Cancel</button>")).toBeLessThan(html.indexOf("Approve</button>"));
    expect(html).toContain("Authoritative review note");
    expect(html).toContain('aria-labelledby="');
    expect(html).toContain('aria-describedby="');
  });

  it("keeps destructive confirmation guarded, with explicit pending copy", () => {
    const html = renderToStaticMarkup(<ActionDialog open
      title="Cancel booking" description="This will release the reserved slot."
      confirmLabel="Cancel appointment" destructive pending pendingLabel="Cancelling booking…"
      onClose={vi.fn()} onConfirm={vi.fn()}/>);
    expect(html).toContain("Cancelling booking…");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('disabled=""');
    expect(html).toContain("bg-destructive");
    expect(html).not.toContain(">Cancel appointment</button>");
  });
});

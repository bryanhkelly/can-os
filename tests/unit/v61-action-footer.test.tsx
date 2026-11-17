import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ActionFooter } from "@/components/workspace/action-footer";
import { FormActions, FormSection } from "@/components/workspace/form-page";
import { ActionDialog } from "@/components/workspace/action-dialog";

describe("V6.1 shared FormSection", () => {
  it("provides accessible rich descriptions without nesting paragraphs", () => {
    const html = renderToStaticMarkup(<FormSection title="Evidence review"
      description={<><p>Check the official source.</p><p>Do not invent evidence.</p></>}
      columns={1}><label htmlFor="evidence-note">Review note</label><textarea id="evidence-note"/></FormSection>);
    const titleId = html.match(/aria-labelledby="([^"]+)"/)?.[1];
    const descriptionId = html.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(titleId).toBeTruthy();
    expect(descriptionId).toBeTruthy();
    expect(html).toContain(`id="${titleId}"`);
    expect(html).toContain(`id="${descriptionId}"`);
    expect(html).toContain('<p>Check the official source.</p>');
    expect(html).toContain('<p>Do not invent evidence.</p>');
    expect(html).toContain("grid-cols-1");
    expect(html).not.toContain("sm:grid-cols-2");
  });
  it("retains two-column layout by default without an empty description reference", () => {
    const html = renderToStaticMarkup(<FormSection title="School dates"><span>Start</span></FormSection>);
    expect(html).toContain("sm:grid-cols-2");
    expect(html).not.toContain("aria-describedby=");
  });
});

describe("V6.1 inline record actions", () => {
  it("reuses the footer geometry without introducing a form or dialog", () => {
    const html = renderToStaticMarkup(<ActionFooter layout="inline">
      <button type="button">Approve record</button>
      <button type="button">Cancel edit</button>
    </ActionFooter>);
    expect(html).toContain('data-action-footer="inline"');
    expect(html).toContain("mt-3");
    expect(html).not.toContain("data-form-actions");
    expect(html).not.toContain("data-dialog-actions");
    expect(html).not.toContain("<form");
    expect(html.indexOf("Approve record")).toBeLessThan(html.indexOf("Cancel edit"));
  });
});

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
    expect(html).not.toContain('aria-disabled="true"');
  });

  it("locks pending form submission and uses the supplied pending label", () => {
    const html = renderToStaticMarkup(<FormActions submitLabel="Publish program"
      pendingLabel="Publishing…" pending cancel={<a href="/programs">Cancel</a>}/>);
    expect(html).toContain("Publishing…");
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('tabindex="-1"');
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

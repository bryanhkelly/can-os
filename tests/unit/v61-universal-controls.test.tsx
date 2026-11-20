import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { GradebookSectionSelector } from "@/components/learning/GradebookSectionSelector";
import { EmptyState, WorkspaceNotice, PageNavigation } from "@/components/workspace";

describe("V6.1 universal action and surface contracts", () => {
  it("prevents repeat submits and announces pending native actions", () => {
    const html = renderToStaticMarkup(<Button loading loadingLabel="Saving…" type="submit">Save</Button>);
    expect(html).toContain('type="submit"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("disabled");
    expect(html).toContain("Saving…");
    expect(html).not.toContain(">Save</button>");
    expect(html).toContain("animate-spin");
  });

  it("defaults native actions to type button rather than accidental submission", () => {
    const html = renderToStaticMarkup(<Button>Open</Button>);
    expect(html).toContain('type="button"');
    expect(html).not.toContain("disabled");
    expect(html).not.toContain('aria-busy="true"');
  });

  it("preserves Slot composition for link actions", () => {
    const html = renderToStaticMarkup(<Button asChild variant="outline"><a href="/programs">Programs</a></Button>);
    expect(html).toMatch(/^<a\b/);
    expect(html).toContain('href="/programs"');
    expect(html).not.toContain("<button");
  });

  it("renders the public sign-in links without an invalid Radix Slot child array", () => {
    const html = renderToStaticMarkup(<div>
      <Button asChild variant="outline"><a href="/access/register">Create a personal CAN account</a></Button>
      <Button asChild variant="outline"><a href="/site/new">Create a Site</a></Button>
    </div>);
    expect(html).toContain('href="/access/register"');
    expect(html).toContain('href="/site/new"');
    expect(html.match(/<a\b/g)).toHaveLength(2);
    expect(html).not.toContain("<button");
  });

  it("keeps the single slotted link when a styled action is marked busy", () => {
    const html = renderToStaticMarkup(<Button asChild loading loadingLabel="Opening…">
      <a href="/explore">Explore programs</a>
    </Button>);
    expect(html).toContain('href="/explore"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Explore programs");
    expect(html).not.toContain("Opening…");
  });

  it("labels gradebook section selection through the canonical Field", () => {
    const html = renderToStaticMarkup(<GradebookSectionSelector
      sections={[{ id:"section-a", title:"Algebra", code:"ALG" }]}
      selectedId="section-a" onSelect={() => undefined}/>);
    const id = html.match(/<label for="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`id="${id}"`);
    expect(html).toContain("Algebra (ALG)");
    expect(html).toContain('value="section-a" selected=""');
    expect(html).not.toMatch(/rounded-(?:lg|xl|2xl)/);
  });

  it("links required field labels, descriptions and validation to the same control", () => {
    const html = renderToStaticMarkup(<Field label="Independent review reason"
      description="Explain the current evidence." required error="A review reason is required.">
      <Input aria-describedby="existing-help"/>
    </Field>);
    const id = html.match(/<label for="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`id="${id}"`);
    expect(html).toContain('required=""');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain(`aria-describedby="existing-help ${id}-description ${id}-error"`);
    expect(html).toContain('role="alert"');
  });

  it("exposes a stable dialog id for an accessible mobile navigation control", () => {
    const html = renderToStaticMarkup(<Modal id="launch-navigation-drawer" open={false}
      label="Launch Studio navigation" onClose={() => undefined}>Menu</Modal>);
    expect(html).toContain('id="launch-navigation-drawer"');
    expect(html).toContain('aria-label="Launch Studio navigation"');
    expect(html).not.toMatch(/\brounded(?:-[\w-]+)?\b/);
  });

  it("keeps empty, error and pagination surfaces rectangular", () => {
    const html = renderToStaticMarkup(<>
      <EmptyState title="No records"/>
      <WorkspaceNotice tone="danger">Unable to load</WorkspaceNotice>
      <PageNavigation label="Pages" showUnavailable />
    </>);
    expect(html).not.toMatch(/\brounded(?:-[\w-]+)?\b/);
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-disabled="true"');
  });
});

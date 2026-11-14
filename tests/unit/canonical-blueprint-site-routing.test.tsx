import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  search: {} as { siteId?: string },
  outcome: { ok: true, data: {
    role: "blueprint_author",
    siteIds: ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"],
    referencesEnabled: false,
  } },
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: object) => ({
    options: config,
    useLoaderData: () => state.outcome,
    useSearch: () => state.search,
  }),
  Link: ({ children, search }: { children: ReactNode; search?: { siteId?: string } }) =>
    <a href={search?.siteId ? `/canonical/blueprints?siteId=${search.siteId}` : "/canonical/blueprints"}>{children}</a>,
}));
vi.mock("@/components/launch-studio/CanonicalBlueprintWorkspace", () => ({
  CanonicalBlueprintWorkspace: ({ siteId }: { siteId: string }) =>
    <div data-testid="blueprint-studio" data-site-id={siteId}>Blueprint editor</div>,
}));
vi.mock("@/components/launch-studio/BlueprintReferenceCatalogPanel", () => ({
  BlueprintReferenceCatalogPanel: () => null,
}));
vi.mock("@/components/workspace", () => ({
  WorkspaceShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/launch-studio/CanonicalBlueprintLoadError", () => ({
  CanonicalBlueprintLoadError: () => <div>Unavailable</div>,
}));
vi.mock("@/modules/blueprints/blueprint-studio.functions", () => ({
  readCanonicalBlueprintHome: vi.fn(),
}));

import { Route } from "@/routes/canonical.blueprints";
const first = "00000000-0000-4000-8000-000000000001";
const second = "00000000-0000-4000-8000-000000000002";

function render() {
  const Page = Route.options.component;
  if (typeof Page !== "function") throw new Error("Blueprint page missing");
  return renderToStaticMarkup(<Page />);
}

describe("canonical Blueprint Studio Site selection", () => {
  it("requires an explicit Site selection rather than silently selecting the first membership", () => {
    state.search = {};
    const html = render();
    expect(html).toContain("Choose an authorized Site");
    expect(html).toContain(first);
    expect(html).toContain(second);
    expect(html).not.toContain("Blueprint editor");
  });

  it("mounts only the explicitly selected authorized Site", () => {
    state.search = { siteId: second };
    const html = render();
    expect(html).toContain(`data-site-id="${second}"`);
    expect(html).not.toContain(`data-site-id="${first}"`);
    expect(html).toContain("Choose a different Site");
  });

  it("denies an unauthorized Site without substituting a different one", () => {
    state.search = { siteId: "00000000-0000-4000-8000-000000000099" };
    const html = render();
    expect(html).toContain("not authorized");
    expect(html).not.toContain("Blueprint editor");
  });
});

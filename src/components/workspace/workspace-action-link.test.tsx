import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkspaceActionLink } from "./workspace-action-link";

describe("shared workspace action link", () => {
  it("renders a V6.1 action with its destination and supporting explanation", () => {
    const html = renderToStaticMarkup(<WorkspaceActionLink
      title="Review Site authorization"
      description="The responsible service verifies current permission."
      href="/sites/123/authorization"
      actionLabel="Review authorization"
    />);
    expect(html).toContain("Review Site authorization");
    expect(html).toContain("The responsible service verifies current permission.");
    expect(html).toContain('href="/sites/123/authorization"');
    expect(html).toContain("Review authorization");
  });
});

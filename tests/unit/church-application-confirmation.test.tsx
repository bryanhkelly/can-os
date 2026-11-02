import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChurchApplicationConfirmation } from "@/components/church/ChurchApplicationConfirmation";
vi.mock("@tanstack/react-router", () => ({ Link: ({children}: {children:ReactNode}) => <a>{children}</a> }));
describe("church application next steps", () => {
  it("shows submitted details and a real follow-up route without claiming approval or email delivery", () => {
    const html = renderToStaticMarkup(<ChurchApplicationConfirmation churchName="Fixture Church" siteName="Fixture Site" contactEmail="leader@example.test"/>);
    expect(html).toContain("leader@example.test");
    expect(html).toContain("Fixture Church");
    expect(html).toContain("Fixture Site");
    expect(html).toContain('href="https://can-academy.netlify.app/contact"');
    expect(html).toContain("No school-setup invitation is issued at this step");
    expect(html).toContain("does not approve the church");
    expect(html).toContain("a response date is not guaranteed");
    expect(html).toContain('tabindex="-1"');
  });
});

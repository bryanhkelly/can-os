import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ClassParticipationAcknowledgments } from "./ClassParticipationAcknowledgments";

describe("Class participation acknowledgments", () => {
  it("renders two independently controlled, accessible acknowledgments", () => {
    const html = renderToStaticMarkup(<ClassParticipationAcknowledgments
      adultChecked={true}
      consentChecked={false}
      onAdultChange={() => {}}
      onConsentChange={() => {}}
      adultLabel="I meet the adult participation requirement."
      consentLabel="I accept these published terms."
    />);
    expect(html).toContain('aria-label="Class participation acknowledgments"');
    expect(html).toContain("I meet the adult participation requirement.");
    expect(html).toContain("I accept these published terms.");
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(2);
    expect((html.match(/checked=""/g) ?? []).length).toBe(1);
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LaunchSiteAddressFields, type LaunchSiteAddressDraft } from "@/components/operations/LaunchSiteAddressFields";

describe("LaunchSiteAddressFields", () => {
  it("renders stable country-code options before browser hydration", () => {
    const address: LaunchSiteAddressDraft = {
      street1: "", street2: "", city: "", state: "", postalCode: "",
      country: "", county: "",
    };

    const markup = renderToStaticMarkup(createElement(LaunchSiteAddressFields, {
      address, onChange: () => undefined,
    }));

    expect(markup).toContain('<option value="FK">FK (FK)</option>');
    expect(markup).not.toContain("Falkland Islands");
  });
});

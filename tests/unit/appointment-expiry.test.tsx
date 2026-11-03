import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appointmentExpiryBounds, appointmentExpiryToIso } from "@/components/operations/appointment-expiry";
import { AppointmentExpiryField } from "@/components/operations/AppointmentExpiryField";

afterEach(() => vi.useRealTimers());
describe("shared appointment expiry contract", () => {
  it("preserves UTC date limits and the existing 89-day offset across a leap day", () => {
    expect(appointmentExpiryBounds(new Date("2028-02-01T23:30:00Z"))).toEqual({ min: "2028-02-01", max: "2028-04-30" });
  });
  it("preserves second-precision UTC expiry rather than silently changing timezone or inclusivity", () => {
    expect(appointmentExpiryToIso("2028-02-29")).toBe("2028-02-29T23:59:59.000Z");
  });
  it.each(["2027-02-29", "2028-02-30", "2028-2-1", "", "2028-02-29T12:00:00Z"])("rejects invalid date %s", date => {
    expect(() => appointmentExpiryToIso(date)).toThrow();
  });
  it("uses a labelled, disabled date control with the same bounds", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2028-02-01T23:30:00Z"));
    const html = renderToStaticMarkup(<AppointmentExpiryField label="Appointment ends" value="2028-02-29" disabled onChange={() => {}}/>);
    expect(html).toContain("Appointment ends");
    expect(html).toContain('type="date"');
    expect(html).toContain('min="2028-02-01"');
    expect(html).toContain('max="2028-04-30"');
    expect(html).toContain('disabled=""');
    expect(html).toMatch(/for="([^"]+)"/);
  });
});

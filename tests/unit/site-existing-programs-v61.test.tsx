import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  existingSiteProgramPresentation, type ExistingSiteProgramV61,
} from "@/domain/site-existing-programs-v61";
import { ExistingSiteProgramsV61 } from "@/components/launch-studio/ExistingSiteProgramsV61";

const record: ExistingSiteProgramV61 = {
  id: "f1000000-0000-4000-8000-000000000004",
  name: "Valor Hybrid High School",
  type: "high_school_extension",
  status: "active",
  gradeRange: { min: "9", max: "12" },
  deliveryModel: { onsite: true, liveOnline: true, asynchronous: true },
};

describe("canonical existing Site Programs in Launch Studio", () => {
  it("shows recorded status and delivery without treating active as enrollment approval", () => {
    expect(existingSiteProgramPresentation(record)).toEqual({
      typeLabel: "High school extension",
      statusLabel: "Active",
      detail: "Grades 9–12 · Onsite · Live online · Self-paced online",
    });
    const html = renderToStaticMarkup(<ExistingSiteProgramsV61 siteId="valor"
      result={{ state: "ready", programs: [
        record,
        { ...record, id: "enrichment", name: "Valor Enrichment",
          type: "after_school_enrichment", status: "active" },
        { ...record, id: "summer", name: "Summer Discovery",
          type: "summer_enrichment", status: "launching" },
      ] }} />);
    expect(html).toContain("Valor Hybrid High School");
    expect(html).toContain("Valor Enrichment");
    expect(html).toContain("Summer Discovery");
    expect(html).toContain("Launching");
    expect(html).toContain("does not confirm publication");
    expect(html).not.toContain("Apply now");
  });

  it("distinguishes an empty authorized read from unavailable data", () => {
    const empty = renderToStaticMarkup(<ExistingSiteProgramsV61 siteId="site"
      result={{ state: "ready", programs: [] }} />);
    const unavailable = renderToStaticMarkup(<ExistingSiteProgramsV61 siteId="site"
      result={{ state: "unavailable" }} />);
    expect(empty).toContain("No existing Programs");
    expect(unavailable).toContain("could not be loaded");
    expect(unavailable).not.toContain("No existing Programs");
  });

  it("does not accept synthetic provenance in the canonical Program read model", () => {
    expect(Object.keys(record)).not.toContain("synthetic");
    expect(existingSiteProgramPresentation({ ...record, status: "paused" }).statusLabel)
      .toBe("Paused");
    expect(existingSiteProgramPresentation({ ...record, status: "closed" }).statusLabel)
      .toBe("Closed");
  });
});

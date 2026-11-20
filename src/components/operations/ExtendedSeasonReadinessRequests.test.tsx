import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExtendedSeasonReadinessRequests } from "./ExtendedSeasonReadinessRequests";

type Props=Parameters<typeof ExtendedSeasonReadinessRequests>[0];
const base={
  season:{id:"season-1",programId:"program-1",status:"draft"} as Props["season"],
  assignments:[] as Props["assignments"],operators:[] as Props["operators"],
  busy:false, onOwnerChange:()=>{},onAssign:()=>{},
};
describe("optional extended-learning readiness requests", () => {
  it("describes evidence requests as separate from approval", () => {
    const html=renderToStaticMarkup(<ExtendedSeasonReadinessRequests {...base}/>);
    expect(html).toContain("Optional evidence requests");
    expect(html).toContain("evidence-gathering assignments only");
    expect(html).toContain("does not");
    expect(html).toContain("Assign readiness requests");
  });
  it("does not display draft evidence controls for a published season", () => {
    const html=renderToStaticMarkup(<ExtendedSeasonReadinessRequests
      {...base} season={{...base.season,status:"registration"} as Props["season"]}/>);
    expect(html).toBe("");
  });
});

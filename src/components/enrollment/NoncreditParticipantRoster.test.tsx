import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NoncreditParticipantRoster } from "./NoncreditParticipantRoster";

const defaults={
  busy:false, seatTarget:null, seatReason:"",
  onStartRelease:()=>{}, onReasonChange:()=>{},
  onConfirmRelease:()=>{}, onCancelRelease:()=>{},
};
type RosterRecord = Parameters<typeof NoncreditParticipantRoster>[0]["roster"][number];
const withdrawn=[{
  registrationId:"registration-1", displayName:"Adult Learner",
  status:"withdrawn", seatReleased:false, completionOutcome:null,
  attendedLinkedSession:false,
}] as unknown as RosterRecord[];

describe("noncredit participant roster", () => {
  it("renders authorized enrollment records without assuming attendance", () => {
    const html=renderToStaticMarkup(<NoncreditParticipantRoster {...defaults} roster={withdrawn}/>);
    expect(html).toContain("Adult Learner");
    expect(html).toContain("Not verified");
    expect(html).toContain("Review capacity release");
  });
  it("requires a documented reason to enable seat release", () => {
    const html=renderToStaticMarkup(<NoncreditParticipantRoster {...defaults} roster={withdrawn}
      seatTarget="registration-1" seatReason="too short"/>);
    expect(html).toContain("Reason for releasing the seat");
    expect(html).toContain("disabled");
  });
  it("preserves the empty roster explanation", () => {
    const html=renderToStaticMarkup(<NoncreditParticipantRoster {...defaults} roster={[]}/>);
    expect(html).toContain("No participants registered for this release");
  });
});

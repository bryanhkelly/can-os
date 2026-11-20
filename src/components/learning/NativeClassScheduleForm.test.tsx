import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NativeClassScheduleForm, type ClassScheduleRow } from "./NativeClassScheduleForm";

const base={
  classId:"class-1",siteTimeZone:"America/Los_Angeles",
  mode:"weekly" as const,first:"",minutes:60,
  customRows:[{id:"custom-1",localStart:"",minutes:60}] as ClassScheduleRow[],
  busy:false,scheduled:false,
  onModeChange:()=>{},onFirstChange:()=>{},onMinutesChange:()=>{},
  onRowChange:()=>{},onRemoveRow:()=>{},onAddRow:()=>{},onSubmit:()=>{},
};

describe("shared native Class scheduling", () => {
  it("requires a dated session and retains the host Site's timezone", () => {
    const html=renderToStaticMarkup(<NativeClassScheduleForm {...base}/>);
    expect(html).toContain("America/Los_Angeles");
    expect(html).toContain("Four weekly Sessions");
    expect(html).toContain("disabled");
    expect(html).toContain("Ambiguous or missing times are rejected");
    expect(html).not.toContain("Attendance verified");
  });
  it("shows a custom dated schedule without manufacturing more sessions", () => {
    const html=renderToStaticMarkup(<NativeClassScheduleForm {...base}
      mode="custom" customRows={[{id:"custom-2",localStart:"2026-11-21T10:00",minutes:45}]}/>);
    expect(html).toContain("Session 1 start");
    expect(html).toContain("Add another Session");
    expect(html).toContain("Schedule custom Sessions");
  });
  it("does not offer a second submission for an already-saved schedule", () => {
    const html=renderToStaticMarkup(<NativeClassScheduleForm {...base}
      first="2026-11-21T10:00" scheduled={true}/>);
    expect(html).toContain("Sessions scheduled");
    expect(html).toContain("Saved. Change the date");
    expect(html).toContain("disabled");
  });
});

import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { RecordedTime } from "./recorded-time";

const meta={
  id: "foundations-recorded-time", title: "03 Components/Recorded time",
  component:RecordedTime,
  args:{value:"2026-11-17T19:00:00.000Z"},
} satisfies Meta<typeof RecordedTime>;
export default meta;
type Story=StoryObj<typeof meta>;

export const SameSourceInstant:Story={
  render:()=> <div className="grid max-w-md gap-4 border bg-card p-5 text-sm">
    <div><p className="font-semibold">UTC evidence view</p>
      <RecordedTime value="2026-11-17T19:00:00.000Z"/></div>
    <div><p className="font-semibold">School-local context</p>
      <RecordedTime value="2026-11-17T19:00:00.000Z" timeZone="America/Los_Angeles"/></div>
    <p className="text-xs text-muted-foreground">
      Both displays retain the same source ISO instant. Time does not prove delivery or attendance.
    </p>
  </div>,
  play:async ({canvasElement})=>{
    const canvas=within(canvasElement);
    await expect(canvas.getByText(/7:00 PM UTC/)).toBeVisible();
    await expect(canvas.getByText(/11:00 AM PST/)).toBeVisible();
    const all=canvasElement.querySelectorAll("time");
    await expect(all).toHaveLength(2);
    await expect(all[0]?.getAttribute("datetime")).toBe(all[1]?.getAttribute("datetime"));
  },
};
export const UnverifiedInstant:Story={
  args:{value:"unknown"},
  play:async ({canvasElement})=>{
    await expect(within(canvasElement).getByText("Recorded time unavailable")).toBeVisible();
  },
};

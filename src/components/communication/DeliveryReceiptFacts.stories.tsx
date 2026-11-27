import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { DeliveryReceiptFacts } from "./DeliveryReceiptFacts";

const meta={
  id: "communication-delivery-receipt-facts", title: "08 Feature workspaces/Communication/Delivery receipt facts",
  component:DeliveryReceiptFacts,
} satisfies Meta<typeof DeliveryReceiptFacts>;
export default meta;
type Story=StoryObj<typeof meta>;
const base={id:"provider-queue-0001",attempts:2,createdAt:"2026-11-17T19:00:00.000Z"};

export const AwaitingProvider:Story={
  args:{receipt:{...base,acceptedAt:null,nextAttemptAt:"2026-11-18T19:00:00.000Z"}},
  render:()=><div className="max-w-xl border bg-card p-5">
    <h2 className="mb-3 font-semibold">Queued notification receipt</h2>
    <DeliveryReceiptFacts receipt={{...base,acceptedAt:null,nextAttemptAt:"2026-11-18T19:00:00.000Z"}}/>
    <p className="mt-3 text-xs">Retry scheduled, not yet sent or delivered.</p>
  </div>,
  play:async ({canvasElement})=>{
    const canvas=within(canvasElement);
    await expect(canvas.getByText("Next scheduled attempt")).toBeVisible();
    await expect(canvas.queryByText("Provider accepted")).not.toBeInTheDocument();
  },
};

export const ProviderAccepted:Story={
  args:{receipt:{...base,acceptedAt:"2026-11-17T19:02:00.000Z",nextAttemptAt:null}},
  render:()=><div className="max-w-xl border bg-card p-5">
    <h2 className="mb-3 font-semibold">Provider acceptance evidence</h2>
    <DeliveryReceiptFacts receipt={{...base,acceptedAt:"2026-11-17T19:02:00.000Z",nextAttemptAt:null}}/>
    <p className="mt-3 text-xs">Acceptance does not verify that the recipient received or read the message.</p>
  </div>,
  play:async ({canvasElement})=>{
    const canvas=within(canvasElement);
    await expect(canvas.getByText("Provider accepted")).toBeVisible();
    await expect(canvas.getByText(/does not verify/)).toBeVisible();
  },
};

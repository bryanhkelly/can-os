import { RecordFacts } from "@/components/workspace/record-layout";
import { formatTimestamp } from "@/modules/calendar/timezone";

/**
 * One read-only field-trip summary for students and guardians.
 * Both audiences supply their own authorized projections. This component
 * never determines who can sign, attend, board, or change permission.
 */
export type FieldTripSummary = {
  departsAt: string;
  returnsAt: string;
  timezone: string;
  deadline: string | null;
  feeAmountCents: number | null;
};

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function FieldTripFacts({ trip }: { trip: FieldTripSummary }) {
  return <RecordFacts label="Field trip schedule and fee" columns={2} className="mt-4" items={[
    { id: "departure", label: "Departure",
      value: `${formatTimestamp(trip.departsAt, trip.timezone)} (${trip.timezone})` },
    { id: "return", label: "Return",
      value: `${formatTimestamp(trip.returnsAt, trip.timezone)} (${trip.timezone})` },
    { id: "deadline", label: "Permission deadline",
      value: trip.deadline ? formatTimestamp(trip.deadline, trip.timezone) : "Before departure" },
    { id: "fee", label: "Fee",
      value: trip.feeAmountCents ? currency.format(trip.feeAmountCents / 100) : "No fee" },
  ]}/>;
}

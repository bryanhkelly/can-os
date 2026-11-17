import { RecordFacts } from "@/components/workspace/record-layout";
import { RecordedTime } from "@/components/workflow/recorded-time";

/** Server-owned outbox receipt evidence, not confirmation of message delivery. */
export interface DeliveryReceiptEvidence {
  id: string;
  attempts: number;
  createdAt: string;
  acceptedAt?: string | null;
  nextAttemptAt?: string | null;
}

export function DeliveryReceiptFacts({ receipt, className }: {
  receipt: DeliveryReceiptEvidence;
  className?: string;
}) {
  return <RecordFacts label="Transport receipt evidence" columns={2} className={className}
    items={[
      {id:"created", label:"Receipt created", value:<RecordedTime value={receipt.createdAt}/>},
      {id:"attempts", label:"Provider attempts", value:receipt.attempts},
      {id:"id", label:"Receipt ID", value:<span className="break-all">{receipt.id}</span>},
      ...(receipt.acceptedAt ? [{id:"accepted",label:"Provider accepted",
        value:<RecordedTime value={receipt.acceptedAt}/>}]:[]),
      ...(receipt.nextAttemptAt ? [{id:"next",label:"Next scheduled attempt",
        value:<RecordedTime value={receipt.nextAttemptAt}/>}]:[]),
    ]}/>;
}

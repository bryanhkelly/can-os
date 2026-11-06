import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { listLaunches } from "@/modules/programs/launch.functions";
type Launch = Awaited<ReturnType<typeof listLaunches>>["launches"][number];

export function LaunchOpeningTask({ launch, busy, open }: {
  launch: Launch;
  busy: boolean;
  open: (recipientPersonId?: string) => Promise<void>;
}) {
  const [recipient, setRecipient] = useState("");
  return <div className="mt-4 rounded-xl border border-warning/40 bg-background p-4">
    {launch.siteId && <Label className="block text-sm">Receiving site operator (required)
      <Select aria-label={`Receiving site operator for ${launch.name}`} value={recipient}
        onChange={event => setRecipient(event.target.value)}
        className="mt-1 block w-full rounded-lg border bg-card p-2 text-sm">
        <option value="">Select the named receiving operator</option>
        {launch.openingOperators.map(operator => <option key={operator.personId} value={operator.personId}>
          {operator.firstName} {operator.lastName}
        </option>)}
      </Select>
      <span className="mt-2 block text-xs text-muted-foreground">
        Only the selected active site registrar/operator can acknowledge receipt after opening.
        This does not waive readiness checks.
      </span>
      {!launch.openingOperators.length && <span role="alert" className="mt-2 block text-xs">
        No active site registrar/operator is available. An existing authorized site grant is required.
      </span>}
    </Label>}
    <Button type="button" disabled={busy || Boolean(launch.siteId && !recipient)}
      onClick={() => void open(recipient || undefined)}
      className="mt-4 min-h-11 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
      Activate
    </Button>
    <p className="mt-2 text-xs text-muted-foreground">
      Activation is not self-certified: the server rechecks the ready Journey and all current opening authority.
    </p>
  </div>;
}


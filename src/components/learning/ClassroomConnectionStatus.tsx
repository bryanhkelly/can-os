import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { useLearnerClassroomRooms } from "@/components/learning/useLearnerClassroomRooms";

/** A neutral device observation only, never a verification of attendance. */
export function ClassroomConnectionStatus({
  rooms,
}: { rooms: ReturnType<typeof useLearnerClassroomRooms> }) {
  const [hadRoom, setHadRoom] = useState(false);
  useEffect(() => {
    if (rooms.isSuccess && rooms.data.rooms.length) setHadRoom(true);
  }, [rooms.isSuccess, rooms.data]);
  const connectedCount = rooms.isSuccess ? rooms.data.rooms.length : 0;
  const state = rooms.isPending ? "Connecting" :
    rooms.isError ? "Access unavailable" :
    connectedCount ? "Connected" :
    rooms.isFetching ? "Rechecking connection" :
    hadRoom ? "Room no longer active" : "Not connected";
  return <div className="border border-border bg-card p-3 text-sm" role="status"
    aria-label="Classroom connection status" aria-live="polite">
    <strong>Classroom connection:</strong> {state}
    {rooms.isError && <p className="mt-1 text-xs text-destructive">
      The current room or your enrollment could not be verified. No classroom actions should be attempted.
    </p>}
    {rooms.isSuccess && !rooms.data.rooms.length && hadRoom &&
      <p className="mt-1 text-xs text-muted-foreground">
        The room may have ended, you may have left, or access may have changed.
        Rejoin only with your facilitator's current code and valid enrollment.
      </p>}
    {rooms.isSuccess && rooms.data.rooms.length > 0 &&
      <p className="mt-1 text-xs text-muted-foreground">
        A paired connection is not verified attendance or proof of viewing.
      </p>}
    {rooms.isError && <Button type="button" variant="outline" size="sm"
      className="mt-2" onClick={() => void rooms.refetch()}>Recheck access</Button>}
  </div>;
}

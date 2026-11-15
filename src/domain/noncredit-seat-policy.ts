/**
 * One authoritative capacity calculation for noncredit release claims.
 * Historical claims and consent are append-only. Only separately approved,
 * audited seats offset those claims. Current invitations reserve the freed
 * or unclaimed space until acceptance/expiry.
 */
export function noncreditSeatsAvailable(values:{
  capacity:number;claims:number;released:number;activeInvitations:number;
}):number {
  const {capacity,claims,released,activeInvitations}=values;
  if (![capacity,claims,released,activeInvitations].every(Number.isSafeInteger) ||
      capacity<1||claims<0||released<0||activeInvitations<0||
      released>claims)
    throw new Error("Invalid canonical enrollment capacity evidence");
  return Math.max(0,capacity-claims+released-activeInvitations);
}

/** An active invitation has already reserved its own place; treating it as
 * a new registration against unheld availability would double-charge seats.
 * Everyone else must respect the FIFO queue, even when a place is open. */
export function noncreditRegistrationRoute(input:{
  seatsRemaining:number;hasWaitingQueue:boolean;hasValidInvitation:boolean;
}):"enroll"|"join_waitlist" {
  if(!Number.isSafeInteger(input.seatsRemaining)||input.seatsRemaining<0)
    throw new Error("Invalid remaining seat count");
  return input.hasValidInvitation ||
    (input.seatsRemaining>0&&!input.hasWaitingQueue)
    ?"enroll":"join_waitlist";
}

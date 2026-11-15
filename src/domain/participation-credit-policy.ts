/** Balance of class-pack/session credits, not school academic credits.
 * This is a projection only. The eventual write command must lock the
 * entitlement and compare current usage transactionally.
 */
export type ParticipationCreditEvent={
  id:string;kind:"issue"|"consume"|"restore";units:number;
  relatedRegistrationId:string|null;reversesEventId:string|null;
};
export function projectParticipationCredits(
  events:readonly ParticipationCreditEvent[],
):{issued:number;consumed:number;restored:number;available:number}{
  const seen=new Set<string>();
  const consumes=new Map<string,ParticipationCreditEvent>();
  let issued=0,consumed=0,restored=0;
  for(const event of events){
    if(!event.id||seen.has(event.id)||!Number.isSafeInteger(event.units)||event.units<1)
      throw new Error("Invalid immutable participation-credit entry");
    seen.add(event.id);
    if(event.kind==="issue"){
      if(event.relatedRegistrationId!==null||event.reversesEventId!==null)
        throw new Error("Credits must be issued independently of registration");
      issued+=event.units;
    }else if(event.kind==="consume"){
      if(!event.relatedRegistrationId||event.reversesEventId!==null)
        throw new Error("Consumption requires an authorized registration");
      consumed+=event.units; consumes.set(event.id,event);
    }
  }
  const reversed=new Set<string>();
  for(const event of events){
    if(event.kind!=="restore")continue;
    const used=event.reversesEventId?consumes.get(event.reversesEventId):undefined;
    if(!used||reversed.has(used.id)||
      event.relatedRegistrationId!==used.relatedRegistrationId||
      event.units!==used.units)
      throw new Error("Restoration must reference one matching consumption");
    restored+=event.units;reversed.add(used.id);
  }
  if(consumed>issued+restored)
    throw new Error("Insufficient issued credit evidence");
  return {issued,consumed,restored,available:issued-consumed+restored};
}

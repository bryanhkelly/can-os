import type {ParticipationRecord,ParticipationSource} from "./participation-read-model";

/**
 * Each source owns its own cursor and read authorization. This guard validates
 * continuation consistency, not permissions or record legitimacy. It has no
 * arbitrary maximum history length: the caller loads pages until the source
 * returns no next cursor.
 */
export function assertParticipationHistoryPage(input:{
  source:ParticipationSource;
  previousCursor:string;
  nextCursor:string|null;
  items:readonly ParticipationRecord[];
  alreadyDisplayed:readonly ParticipationRecord[];
}):void{
  const {source,previousCursor,nextCursor,items,alreadyDisplayed}=input;
  if(nextCursor!==null&&
     (nextCursor===previousCursor||items.length===0))
    throw new Error("Participation history source cursor did not advance");
  const known=new Set(alreadyDisplayed.map(row=>row.key));
  for(const item of items){
    if(item.source!==source||item.key!==source+":"+item.sourceId||
       known.has(item.key)){
      throw new Error("Duplicate or mismatched authoritative participation history");
    }
    known.add(item.key);
  }
}

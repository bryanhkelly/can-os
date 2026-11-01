/** Safety-sensitive read models cannot return a silently truncated subset.
 * Exact-limit rows may have more results; reject rather than imply completeness.
 * This does not replace separately scoped row-level authorization.
 */
export function requireCompletePickupSafetyRows(
  sources:ReadonlyArray<{name:string;received:number;limit:number}>,
):void {
  const incomplete=sources.filter(source=>source.received>=source.limit);
  if(incomplete.length){
    throw new Error("Pickup roster is incomplete ("+
      incomplete.map(source=>source.name).join(", ")+
      "). Narrow the school/date scope or use an authorized per-student view; do not assume child release is safe.");
  }
}

/** Selection stays deterministic; do not silently choose between different
 * Class schedules or Sites for the same registered Course. */
export function selectCourseClass(
  available: readonly {id:string;seatsRemaining:number|null}[],
  requestedClassId?:string,
):string {
  if(!available.length)throw new Error("No authorized ready Class is available for this Course");
  if(requestedClassId){
    const item=available.find(candidate=>candidate.id===requestedClassId);
    if(!item)throw new Error("Selected Class is not available for this Course");
    if(item.seatsRemaining!==null&&item.seatsRemaining<=0)throw new Error("Selected Class is full");
    return item.id;
  }
  const options=available.filter(item=>item.seatsRemaining===null||item.seatsRemaining>0);
  if(!options.length)throw new Error("All Classes for this Course are full");
  if(options.length!==1)throw new Error("Choose a Class before registering for this Course");
  return options[0]!.id;
}

/** Load bounded batches concurrently, yielding results in input order.
 * Consumers can stop after a useful batch; no later batch is started eagerly.
 * Individual error handling belongs to the caller (e.g. safeLoader).
 */
export async function* orderedBatches<T,R>(
  items:readonly T[],size:number,load:(item:T)=>Promise<R>,
):AsyncGenerator<R[]>{
  if(!Number.isSafeInteger(size)||size<1)throw new RangeError("Invalid batch size");
  for(let offset=0;offset<items.length;offset+=size){
    yield await Promise.all(items.slice(offset,offset+size).map(item=>load(item)));
  }
}

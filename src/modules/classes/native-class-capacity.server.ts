import {and,count,eq,inArray} from "drizzle-orm";
import type {db} from "@/db/client";
import {canonicalClassEnrollments} from "@/db/canonical-v301";

/** All Class admission methods consume this same pool. For mutations, callers
 * must hold the canonical Class row lock before reading occupancy. Advisory
 * discovery reads are not reservations. */
export async function readNativeClassOccupancy(reader:Pick<typeof db,"select">,classId:string):Promise<number>{
  const [row]=await reader.select({total:count()}).from(canonicalClassEnrollments)
    .where(and(eq(canonicalClassEnrollments.classId,classId),
      inArray(canonicalClassEnrollments.status,["pending","active"])));
  return row?.total??0;
}

/** Pure seat-accounting projection shared by issuance and activation.
 * An accepted or unexpired issued offer reserves one place per student.
 * An already-enrolled student counts only once even when an accepted offer remains.
 */
export type SeatEnrollment={studentId:string};
export type SeatOffer={studentId:string;status:string;expiresAt:Date|null};
export function calculateSeatOccupancy(enrollments:readonly SeatEnrollment[],offers:readonly SeatOffer[],now:Date):number{
 const occupied=new Set(enrollments.map(row=>row.studentId));
 for(const offer of offers){
  if(offer.status==="accepted"||(offer.status==="issued"&&(!offer.expiresAt||offer.expiresAt.getTime()>now.getTime()))){
   occupied.add(offer.studentId);
  }
 }
 return occupied.size;
}

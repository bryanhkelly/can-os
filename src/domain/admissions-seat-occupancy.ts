/** Pure seat-accounting projection shared by issuance and activation.
 * An accepted or unexpired issued offer reserves one place per student.
 * An already-enrolled student counts only once even when an accepted offer remains.
 */
import {offerHoldsSeat} from "./admissions-policy";
export type SeatEnrollment={studentId:string};
export type SeatOffer={studentId:string;status:string;expiresAt:Date|null};
export function calculateSeatOccupancy(enrollments:readonly SeatEnrollment[],offers:readonly SeatOffer[],now:Date):number{
 const occupied=new Set(enrollments.map(row=>row.studentId));
 for(const offer of offers){
  if(offerHoldsSeat(offer,now)){
   occupied.add(offer.studentId);
  }
 }
 return occupied.size;
}

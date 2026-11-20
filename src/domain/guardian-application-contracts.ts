export interface GuardianApplicationProgram {
  id: string;
  name: string;
  schoolYears?: readonly { id: string; name: string }[];
}
export interface GuardianApplicationHousehold { id: string; name: string }
export interface GuardianApplicationStudent {
  studentProfileId: string;
  studentFirstName: string;
  studentLastName: string;
  gradeLevel: string;
  householdId: string;
}
export interface GuardianApplicationSubmission {
  requestId: string;
  programId: string;
  studentFirstName: string;
  studentLastName: string;
  gradeLevel: string;
  householdId?: string;
  schoolYearId?: string;
  studentProfileId?: string;
  familyStartRequestId?: string;
  originTransferActionId?: string;
  confirmedTransferDestination?: true;
  destinationRecordsReleaseAuthorized?: true;
}

export interface GuardianApplicationTransferRequest {
  id:string;
  studentProfileId:string;
  originProgramId:string|null;
  originSchoolName:string;
  destinationSchoolName:string;
  destinationFamilyStartRequestId:string|null;
  destinationFamilyStartProgramId:string|null;
  originExited:boolean;
}

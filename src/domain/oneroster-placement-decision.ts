/** An external OneRoster enrollment cannot silently rebind a new CAN student or Section. */
export type OneRosterPlacementIdentity={
 programId:string;siteId:string;studentProfileId:string;sectionId:string;
 externalSchoolSourcedId:string;externalUserSourcedId:string;
 externalClassSourcedId:string;sourceHash:string;
};
export type StoredOneRosterPlacement={
 entityType:string;entityId:string;metadata:Record<string,unknown>;
};
export function assessOneRosterPlacementReplay(
 prior:StoredOneRosterPlacement|null,target:OneRosterPlacementIdentity,
):{enrollmentId:string|null;disposition:"new"|"idempotent_retry"|"same_destination_reimport"}{
 if(!prior)return {enrollmentId:null,disposition:"new"};
 if(prior.entityType!=="enrollment"||!prior.entityId)
  throw new Error("External enrollment sourcedId belongs to a different mapping type");
 for(const field of ["programId","siteId","studentProfileId","sectionId",
   "externalSchoolSourcedId","externalUserSourcedId","externalClassSourcedId"] as const)
  if(prior.metadata[field]!==target[field])
   throw new Error("External enrollment identity or CAN destination changed; registrar reconciliation required");
 if(typeof prior.metadata.sourceHash!=="string"||prior.metadata.sourceHash.length!==64||
   typeof prior.metadata.approvedByPersonId!=="string")
  throw new Error("Historical OneRoster approval provenance missing");
 return {enrollmentId:prior.entityId,
   disposition:prior.metadata.sourceHash===target.sourceHash?"idempotent_retry":"same_destination_reimport"};
}

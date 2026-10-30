/**
 * A church-hosted CAN agreement cannot leave a confirmed child in a mere
 * Program roster. At least one named instructional Section must be placed
 * atomically with activation; the actual service independently verifies that
 * the Section is staffed, available and belongs to that Program/school year.
 */
export function requireSectionForChurchHostedActivation(
  currentChurchAuthorizationId:string|null,sectionId?:string,
):void {
  if(currentChurchAuthorizationId&&!sectionId)
    throw new Error("Choose a staffed class to activate this church-hosted school enrollment");
}

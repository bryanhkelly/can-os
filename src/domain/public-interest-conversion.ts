import { normalizeAccessEmail } from "./access-tokens";

/**
 * A public form proves neither adult identity nor a guardian relationship.
 * Linking the form to GF22 only preserves provenance after a registrar
 * confirms that an unverified contact matches the reviewed intake data.
 */
export function assertPublicInterestConversion(input: {
  interest: {
    status: string;
    applicationId: string | null;
    programId: string;
    siteId: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  request: {
    programId: string;
    siteId: string;
    guardianFirstName: string;
    guardianLastName: string;
    guardianEmail: string;
    contactReviewed: boolean;
    hasExistingStudent: boolean;
    hasExistingApplication: boolean;
  };
}): void {
  const { interest, request } = input;
  if (interest.programId !== request.programId || interest.siteId !== request.siteId)
    throw new Error("Public interest does not belong to the selected Site and Program");
  if (interest.status === "closed" || interest.status === "converted" || interest.applicationId)
    throw new Error("Public interest is no longer available for conversion");
  if (!["new", "contacted"].includes(interest.status))
    throw new Error("Public interest status does not allow conversion");
  if (!request.contactReviewed)
    throw new Error("Review the adult contact and student identity before continuing");
  if (request.hasExistingStudent || request.hasExistingApplication)
    throw new Error("Existing students or households require the normal verified admissions intake");
  const normalized = (name: string) => name.trim().toLocaleLowerCase("en-US");
  if (normalized(interest.firstName) !== normalized(request.guardianFirstName) ||
      normalized(interest.lastName) !== normalized(request.guardianLastName) ||
      normalizeAccessEmail(interest.email) !== normalizeAccessEmail(request.guardianEmail)) {
    throw new Error("Contact does not match the selected public request. Use normal intake for corrections.");
  }
}

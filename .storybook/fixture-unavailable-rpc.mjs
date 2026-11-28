// Explicit, reviewed fixture-only endpoints. These return no data, grant no
// permission, and never simulate a successful write. Add a dedicated synthetic
// fixture when a story needs a successful operation.
export const unavailableRpcExports = Object.freeze({
  "@/modules/identity/platform-owner-delegation.functions": ["endPlatformOwnerDelegation"],
  "@/modules/identity/workspace-session.functions": ["getWorkspaceSession"],
  "@/modules/programs/launch.functions": ["listLaunches"],
  "@/modules/blueprints/blueprint-studio.functions": ["readCanonicalBlueprintWorkspace", "createCanonicalBlueprintConfiguration", "readCanonicalBlueprintConfiguration", "readCanonicalBlueprintReview", "saveCanonicalBlueprintConfiguration", "submitCanonicalBlueprintConfiguration", "executeCanonicalBlueprintConfiguration", "exploreCanonicalBlueprintReferences", "readCanonicalBlueprintReviewHistory", "discoverCanonicalBlueprintOfferings"],
  "@/modules/sites/launch-site-publication.functions": ["readLaunchSitePublication", "reviewLaunchSiteWebsiteCopy"],
  "@/modules/sites/site-publication.functions": ["setSitePublicationStatus", "verifySitePublicationReachability"],
  "@/modules/enrollment/noncredit-enrollment-publication.functions": ["getNoncreditEnrollmentPublisher"],
  "@/modules/programs/site-programs-audiences-v61.functions": ["readSiteProgramsAudiencesV61"],
  "@/modules/academic-time/school-year-studio.functions": ["getSchoolYearStudio", "createStudioGradeScale", "createStudioYear"],
  "@/modules/programs/site-information-v61.functions": ["readSiteInformationV61", "saveSiteInformationV61"],
  "@/modules/operations/launch-site-facilities.functions": ["createLaunchSiteSpaceV61", "readLaunchSiteFacilitiesV61", "saveLaunchSiteSpaceV61"],
  "@/modules/classes/launch-class-facilities.functions": ["readLaunchClassFacilitiesV61", "saveLaunchClassPhysicalPlanV61"],
  "@/modules/classes/class-staff.functions": ["assignNativeClassStaff"],
  "@/modules/identity/admin.functions": ["inviteStaffMember", "listAccessAccounts", "listPeople", "listScopedSites", "setGrantActive"],
  "@/modules/operations/room-coverage.functions": ["getRoomCoverageWorkspaceFn", "createRoomAtSiteFn", "saveRoomCoverageFn"],
  "@/modules/classes/unified-class.functions": ["getUnifiedClassCourseOptions", "getNativeClassOperatorSites", "getMyUnifiedClassDrafts", "createUnifiedClassDraft", "publishUnifiedClassOffering", "closeUnifiedClassOffering", "activateUnifiedClass", "createNextUnifiedClassOfferingVersion"],
  "@/modules/programs/publisher-rollout.functions": ["getPublisherRolloutTemplate"],
});
const prefix = "virtual:storybook-unavailable-rpc/";
export const unavailableRpcAliases = Object.fromEntries(Object.keys(unavailableRpcExports).map(path=>[path,prefix+path.slice(2)]));
const reverse = new Map(Object.entries(unavailableRpcAliases).map(([path,id])=>[id,path]));
export function resolveUnavailableRpc(id) {
  return reverse.has(id) ? "\0"+id : null;
}
export function unavailableRpcSource(id) {
  if (!id.startsWith("\0")) return null;
  const path=reverse.get(id.slice(1));
  if(!path)return null;
  return unavailableRpcExports[path].map(name=>"export async function "+name+"() { throw new Error("+JSON.stringify("Storybook fixture: "+name+" is unavailable; no live service was called.")+"); }").join("\n");
}

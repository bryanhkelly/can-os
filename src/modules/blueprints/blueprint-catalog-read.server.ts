import {getBlueprintPlanningContext} from "./verified-site-planning.server";
import {getCanonicalCommandContext} from "@/modules/identity/canonical-command-context.server";
import {getBlueprintReferenceCatalog} from "./blueprint-reference-catalog.server";
import {getAvailableOfferings} from "@/modules/programs/program-discovery.server";
import {getCanonicalBlueprintWorkspace} from "./blueprint-workspace.server";
import {getCanonicalBlueprintReviewQueue} from "./blueprint-review-queue.server";
import {listBlueprintReviewEvidence} from "./blueprint-review-evidence.server";
export async function exploreCanonicalBlueprintReferencesService(request:Request,raw:unknown){
 return getBlueprintReferenceCatalog(await getBlueprintPlanningContext(request),raw);
}
export async function discoverCanonicalBlueprintOfferingsService(request:Request,raw:unknown){
 return getAvailableOfferings(await getBlueprintPlanningContext(request),raw);
}
export async function readCanonicalBlueprintWorkspaceService(request:Request,raw:unknown){
 return getCanonicalBlueprintWorkspace(await getBlueprintPlanningContext(request),raw);
}
export async function listCanonicalBlueprintReviewsService(request:Request){
 return getCanonicalBlueprintReviewQueue(await getCanonicalCommandContext(request));
}
export async function listCanonicalBlueprintReviewEvidenceService(request:Request,raw:unknown){
 return listBlueprintReviewEvidence(await getCanonicalCommandContext(request),raw);
}

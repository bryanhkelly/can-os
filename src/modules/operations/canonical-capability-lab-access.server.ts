import {getRequest} from "@tanstack/react-start/server";
import {resolveCanonicalProvider} from "./canonical-provider-access.server";
export async function requireCanonicalLabProvider(requiredCapability="noncredit.assessment.provision"){
 return resolveCanonicalProvider(getRequest(),requiredCapability);
}

import {getRequest} from "@tanstack/react-start/server";
import {resolveCanonicalFacilitator} from "./canonical-facilitator-context.server";
export function requireCanonicalFacilitator(){return resolveCanonicalFacilitator(getRequest());}

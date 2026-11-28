import {getRequest} from "@tanstack/react-start/server";
import {resolveOperatorReportingScopeRequest} from "./operator-reporting-scope-request.server";
export async function requireOperatorReportingScope(){return resolveOperatorReportingScopeRequest(getRequest());}

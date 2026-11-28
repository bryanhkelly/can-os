// Legacy RPC adapter. Owner authority and writes remain in request-explicit services.
import {getRequest} from "@tanstack/react-start/server";
import * as service from "./sender-registry-service.server";
export {readCampaignSenderRegistryState,readCampaignSenderRegistry} from "./campaign-sender-state.server";
export function readSenderAdministration(organizationId:string|null=null){return service.readSenderAdministration(getRequest(),organizationId);}
export function listSenderOrganizations(){return service.listSenderOrganizations(getRequest());}
export function changeSenderAdministration(data:Parameters<typeof service.changeSenderAdministration>[1]){return service.changeSenderAdministration(getRequest(),data);}
export function revokeSenderAdministration(data:Parameters<typeof service.revokeSenderAdministration>[1]){return service.revokeSenderAdministration(getRequest(),data);}

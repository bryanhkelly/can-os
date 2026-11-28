import {getRequest} from "@tanstack/react-start/server";
import {resolveVerifiedAdultAccount,resolveNoncreditParticipantAccount} from "./noncredit-participant-identity.server";
export * from "./noncredit-participant-identity.server";
export function requireVerifiedAdultAccount(){return resolveVerifiedAdultAccount(getRequest());}
export function requireNoncreditParticipantAccount(){return resolveNoncreditParticipantAccount(getRequest());}

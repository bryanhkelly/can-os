import type {Plugin} from "vite";
import {fixtureImportViolation} from "./fixture-isolation.mjs";
import {resolveUnavailableRpc,unavailableRpcSource} from "./fixture-unavailable-rpc.mjs";

/** Reject production server dependencies, including unmocked RPC facades. */
export function fixtureIsolationPlugin():Plugin{
 return {name:"becomuna-storybook-fixture-isolation",enforce:"pre",resolveId(id){return resolveUnavailableRpc(id);},load(id){
   const fixture=unavailableRpcSource(id);
   if(fixture!==null)return fixture;
   const reason=fixtureImportViolation(id);
   if(reason)this.error("Storybook fixture isolation: "+reason+" at "+id+". Use a presentation component or an explicit fixture alias.");
   return null;
 }};
}

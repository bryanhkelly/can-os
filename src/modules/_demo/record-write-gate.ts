import {assertSyntheticMutation,type DemoRole} from "./demo-write-gate";
/** School records require an authorized session at their command boundary.
 * Demo fixtures additionally require the explicit synthetic write opt-in. */
export function assertRecordWriteAllowed(metadata:Record<string,unknown>,role:DemoRole):void{
 if(metadata.synthetic===true)assertSyntheticMutation(role);
}

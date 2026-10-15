import {describe,it,expect} from "vitest";
import {programReadiness,readinessFromSnapshot} from "../src/domain/program-readiness";
describe("school readiness",()=>{
 it("requires all canonical dimensions before launch",()=>expect(programReadiness([])).toMatchObject({blockers:6,launchReady:false}));
 it("recognizes six configured ready dimensions",()=>expect(programReadiness(readinessFromSnapshot({academics:"ready",staffing:"ready",safeguarding:"ready",calendar:"ready",enrollment:"ready",records:"ready"})).launchReady).toBe(true));
});

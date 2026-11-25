import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read=(path:string)=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");
describe("Graduation credential RPC boundary",()=>{
  const root="src/modules/learning/";
  const rpc=read(root+"graduation.functions.ts");
  const server=read(root+"graduation.server.ts");
  it("keeps the twelve public operations behind server handlers",()=>{
    expect(rpc.match(/createServerFn\(/g)).toHaveLength(12);
    expect(rpc.match(/await import\("\.\/graduation.server"\)/g)).toHaveLength(12);
    expect(rpc).not.toContain("@/db/");
    expect(rpc).not.toContain("export async function");
    expect(rpc).not.toContain("assertDiplomaFreshForAuthorizedRelease");
    expect(rpc).not.toContain("assertOfficialTranscriptFreshForAuthorizedRelease");
  });
  it("preserves the internal credential release gates and their locks",()=>{
    expect(server).toContain("export async function assertDiplomaFreshForAuthorizedRelease");
    expect(server).toContain("export async function assertOfficialTranscriptFreshForAuthorizedRelease");
    expect(server).toContain('for("share")');
    expect(server).toContain("pg_advisory_xact_lock");
    for(const path of ["academic-credential-freshness.server.ts","diploma-release-freshness.server.ts"]){
      expect(read(root+path)).toContain('from "./graduation.server"');
      expect(read(root+path)).not.toContain('from "./graduation.functions"');
    }
  });
});

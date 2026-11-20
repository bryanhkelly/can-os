import { describe, expect, it } from "vitest";
import { canonicalOperationsUrlValid } from "@/domain/canonical-operations-connection";

const owner="postgresql://neondb_owner:owner-secret@ep-sample-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require";
const operations="postgresql://can_os_canonical_ops_app:operator-secret@ep-sample-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require";
const auth="postgresql://can_os_canonical_auth_app:auth-secret@ep-sample-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require";

describe("restricted canonical catalog/Blueprint database URL",()=>{
  it("accepts only the dedicated operations login targeting the exact main connection's Neon endpoint and database",()=>{
    expect(canonicalOperationsUrlValid(operations,owner,auth)).toBe(true);
    expect(canonicalOperationsUrlValid(operations.replace("-pooler.","."),owner,auth)).toBe(true);
  });
  it("rejects owner reuse, authentication login reuse, missing password and different Neon branches/databases",()=>{
    for(const candidate of [
      owner,auth,
      operations.replace("operator-secret",""),
      operations.replace("can_os_canonical_ops_app","neondb_owner"),
      operations.replace("ep-sample","ep-different"),
      operations.replace("/neondb?","/other?"),
      operations+"&options=-csearch_path%3Dpublic",
      operations+"&role=neondb_owner",
      "",
    ]){
      expect(canonicalOperationsUrlValid(candidate,owner,auth)).toBe(false);
    }
  });
});

import { describe,expect,it } from "vitest";
import { checkEnrollmentAppReachability } from "@/modules/sites/app-enrollment-reachability.server";

const SHA="a".repeat(40);
function mockFetch(input:{
  fingerprintSha?:string|null;
  fingerprintStatus?:number;
  enrollmentStatus?:number;
  login?:boolean;
}) {
  return (async (url:RequestInfo|URL)=>{
    const address=String(url);
    if(address.endsWith("/release-fingerprint"))
      return new Response(JSON.stringify({
        application:"can-os",sourceRevision:input.fingerprintSha===undefined?SHA:input.fingerprintSha,
      }),{
        status:input.fingerprintStatus??200,
        headers:{"Content-Type":"application/json"},
      });
    if(address.endsWith("/learn/enroll")){
      if(input.login)return new Response(null,{
        status:302,headers:{Location:"/access?returnTo=%2Flearn%2Fenroll"},
      });
      return new Response("<html><body>Register</body></html>",{
        status:input.enrollmentStatus??200,headers:{"Content-Type":"text/html"},
      });
    }
    throw new Error("unexpected fetch");
  }) as typeof fetch;
}

describe("actual deployment enrollment handoff readiness",()=>{
  it("fails closed for missing origin and never accesses the network",async()=>{
    const result=await checkEnrollmentAppReachability({configuredOrigin:null,
      fetcher:(async()=>{throw new Error("not allowed")}) as typeof fetch});
    expect(result.status).toBe("unconfigured");
  });

  it("requires a matching 40 character deployed source SHA",async()=>{
    const verified=await checkEnrollmentAppReachability({
      configuredOrigin:"https://can-os.example.org",
      expectedSourceRevision:SHA,fetcher:mockFetch({}),
    });
    expect(verified.status).toBe("verified");
    expect(verified.routeStatus).toBe("available");
    expect(verified.deployedSourceRevision).toBe(SHA);
    const mismatch=await checkEnrollmentAppReachability({
      configuredOrigin:"https://can-os.example.org",
      expectedSourceRevision:"b".repeat(40),fetcher:mockFetch({}),
    });
    expect(mismatch.status).toBe("revision_mismatch");
  });

  it("distinguishes reachable app from exact source verification",async()=>{
    const result=await checkEnrollmentAppReachability({
      configuredOrigin:"https://can-os.example.org",
      fetcher:mockFetch({login:true}),
    });
    expect(result.status).toBe("revision_unverified");
    expect(result.routeStatus).toBe("login_required");
  });

  it("denies unknown revisions, failed route, fake origins and network errors",async()=>{
    for(const [input,status] of [
      [{fingerprintSha:null},"revision_unknown"],
      [{enrollmentStatus:404},"route_unavailable"],
      [{fingerprintStatus:404},"unreachable"],
    ] as const) {
      expect((await checkEnrollmentAppReachability({
        configuredOrigin:"https://can-os.example.org",
        expectedSourceRevision:SHA,fetcher:mockFetch(input),
      })).status).toBe(status);
    }
    expect((await checkEnrollmentAppReachability({
      configuredOrigin:"https://can-os.example.org/path",
      fetcher:mockFetch({}),
    })).status).toBe("unconfigured");
    expect((await checkEnrollmentAppReachability({
      configuredOrigin:"https://can-os.example.org",
      fetcher:(async()=>{throw new Error("offline")}) as typeof fetch,
    })).status).toBe("unreachable");
  });
});

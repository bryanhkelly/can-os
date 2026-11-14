import {describe,it,expect} from "vitest";
import {classifySessionDevice,learningEvidenceLevel} from "@/domain/session-device";
describe("session-device evidence",()=>{
 it("requires an explicitly trusted edge header",()=>{
 const r=new Request("https://example.test",{headers:{"x-forwarded-for":"192.0.2.10","x-nf-client-connection-ip":"203.0.113.7"}});
 expect(classifySessionDevice(r,"x-forwarded-for").ipAddress).toBeNull();
 expect(classifySessionDevice(r,"x-nf-client-connection-ip").ipAddress).toBe("203.0.113.7");
 });
 it("classifies coarse devices",()=>{
 const r=new Request("https://example.test",{headers:{"user-agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit Safari/604"}});
 expect(classifySessionDevice(r).deviceCategory).toBe("phone");
 expect(classifySessionDevice(r).osFamily).toBe("iOS");
 });
 it("never treats video playback as verified attendance",()=>expect(learningEvidenceLevel("video_ended")).toBe("client_observed"));
});

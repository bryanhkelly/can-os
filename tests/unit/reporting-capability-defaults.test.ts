import {afterEach,describe,expect,it,vi} from "vitest";
import {reportingProjectionEnabled,reportingSnapshotsEnabled} from "@/modules/insights/reporting-projection-rollout.server";
afterEach(()=>vi.unstubAllEnvs());
describe("reporting capability defaults",()=>{
  it("does not require legacy rollout flags",()=>{
    vi.stubEnv("CAN_REPORTING_SOURCE_PROJECTION_ENABLED","0");
    vi.stubEnv("CAN_REPORTING_SOURCE_SNAPSHOTS_ENABLED","0");
    vi.stubEnv("CAN_REPORTING_PROJECTION_MAINTENANCE_PAUSE","");
    vi.stubEnv("CAN_REPORTING_SNAPSHOT_MAINTENANCE_PAUSE","");
    expect(reportingProjectionEnabled()).toBe(true);
    expect(reportingSnapshotsEnabled()).toBe(true);
  });
  it("only pauses writes for explicit operational maintenance",()=>{
    vi.stubEnv("CAN_REPORTING_PROJECTION_MAINTENANCE_PAUSE","");
    vi.stubEnv("CAN_REPORTING_SNAPSHOT_MAINTENANCE_PAUSE","1");
    expect(reportingProjectionEnabled()).toBe(true);
    expect(reportingSnapshotsEnabled()).toBe(false);
    vi.stubEnv("CAN_REPORTING_PROJECTION_MAINTENANCE_PAUSE","1");
    expect(reportingProjectionEnabled()).toBe(false);
    expect(reportingSnapshotsEnabled()).toBe(false);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(new URL("../../src/routes/class.tsx", import.meta.url), "utf8");
const start = route.indexOf("function NativeAdultLearnerClasses(");
const end = route.indexOf("  return <WorkspaceShell", start);
const controller = route.slice(start, end);
const restored = route.slice(
  route.indexOf('aria-label="Verified CAN learner session recovery"', start),
  route.indexOf('    <section className="mt-6">', end),
);

describe("native Class session restoration versus view refresh", () => {
  it("keeps successful session issuance separate from query-refresh errors", () => {
    expect(controller).toContain("const recovery=useMutationFeedback(refresh)");
    expect(controller).toContain("const recovering=recovery.pending||recovery.refreshFailed");
    expect(controller).toContain("await recovery.run(");
    expect(controller).toContain("()=>resumeLinkedNativeClassLearner()");
    expect(controller).toContain("successMessage:");
    expect(controller).toContain("commandErrorMessage:");
    expect(controller).toContain("refreshErrorMessage:");
    expect(controller).not.toContain("await refresh();");
    expect(controller).not.toContain("catch(error)");
  });

  it("blocks repeated restoration and permits refresh-only recovery", () => {
    expect(restored).toContain("disabled={recovering}");
    expect(restored).toContain("<MutationFeedback state={{...recovery,retryRefresh:recovery.retryRefresh}}");
    expect(restored).toContain('pendingMessage="Restoring verified Class access…"');
    expect(restored).not.toContain("recoveryError");
  });

  it("refreshes native Class invitations, approvals, enrollments and My Activity", () => {
    const refresh = controller.slice(
      controller.indexOf("  async function refresh(){"),
      controller.indexOf("  const recovery=useMutationFeedback(refresh)"),
    );
    expect(refresh.match(/throwOnError:true/g)).toHaveLength(5);
    for (const query of [
      "native-public-class-catalog", "native-my-class-enrollment-history",
      "native-my-class-invitations", "native-my-class-approvals", "my-activity",
    ]) expect(refresh).toContain('queryKey:["' + query + '"');
  });
});

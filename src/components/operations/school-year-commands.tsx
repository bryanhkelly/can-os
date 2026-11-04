import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useWorkspaceMutation } from "@/hooks/useWorkspaceMutation";
import { mutationErrorMessage } from "@/lib/mutation-feedback";
import { Button } from "@/components/ui/button";

export type SchoolYearRun = (operation: () => Promise<unknown>) => Promise<void>;

/** Duplicate-safe school-year commands with saved-but-refresh-failed recovery. */
export function useSchoolYearCommands() {
  const router = useRouter();
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const mutation = useWorkspaceMutation({ mutationFn: (operation: () => Promise<unknown>) => operation(), invalidateRouter: () => router.invalidate() });
  const busy = mutation.isSubmitting || !!mutation.refreshError;
  const run: SchoolYearRun = async operation => {
    if (busy) return;
    setError(""); setNotice("");
    try {
      const submission = await mutation.submit(operation);
      if (submission.status === "ignored") return;
      if (submission.refreshError) { setError("Saved successfully, but refresh failed. Refresh this school year; do not resubmit."); return; }
      setNotice("Saved to school records.");
    } catch (e) { setError(mutationErrorMessage(e, "Unable to save")); }
  };
  async function retryRefresh() {
    const outcome = await mutation.retryRefresh();
    if (outcome.status === "refreshed") { setError(""); setNotice("Saved school-year records have been refreshed."); }
  }
  const feedback = <>
    {error && <p role="alert" className="mt-5 rounded-lg border border-destructive p-3 text-sm">{error}</p>}
    {mutation.refreshError && <Button type="button" variant="outline" disabled={mutation.isSubmitting} onClick={() => void retryRefresh()} className="mt-3">Retry saved school-year refresh</Button>}
    {notice && <p role="status" className="mt-5 rounded-lg border p-3 text-sm">{notice}</p>}
  </>;
  return { busy, run, feedback };
}

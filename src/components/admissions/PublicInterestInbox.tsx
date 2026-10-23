import { useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import {
  listPublicAdmissionsInterests, setPublicAdmissionsInterestStatus,
} from "@/modules/enrollment/public-admissions-interest.functions";

type Row = Awaited<ReturnType<typeof listPublicAdmissionsInterests>>[number];

/** These records contain unverified parent-supplied contact data. */
export function PublicInterestInbox({ items }: { items: readonly Row[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function changeStatus(row: Row, status: "contacted" | "closed") {
    setBusyId(row.id); setError(""); setNotice("");
    try {
      await setPublicAdmissionsInterestStatus({
        data: { interestId: row.id, status },
      });
      setNotice(status === "contacted"
        ? "Contact recorded. This does not verify a guardian or create an Application."
        : "Interest request closed.");
      await router.invalidate();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update interest.");
    } finally {
      setBusyId(null);
    }
  }

  return <section className="mt-8 rounded-xl border bg-card p-5">
    <h2 className="font-serif text-2xl">Public program interest</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Requests from published program pages. A registrar may review a contact,
      confirm the new student identity and carry these details into the normal
      admissions inquiry. Any guardian relationship remains pending verification;
      a public request never grants school access.
    </p>
    {error && <p role="alert" className="mt-3 text-sm">{error}</p>}
    {notice && <p role="status" className="mt-3 text-sm">{notice}</p>}
    <div className="mt-4 grid gap-3">
      {items.map(row => <article key={row.id} className="rounded-lg border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">{row.firstName} {row.lastName}</h3>
            <p className="text-sm text-muted-foreground">{row.programName}</p>
            <p className="mt-1 text-sm">{row.email}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {new Date(row.createdAt).toLocaleString()} · {row.status}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {row.applicationId ? <Link to="/admissions/intake"
              search={{siteId:row.siteId,programId:row.programId,
                application:row.applicationId,interest:undefined}}
              className="rounded-lg border px-3 py-2 text-xs font-semibold">
              View linked inquiry
            </Link> : row.status !== "closed" && <Link to="/admissions/intake"
              search={{siteId:row.siteId,programId:row.programId,
                application:undefined,interest:row.id}}
              className="rounded-lg border px-3 py-2 text-xs font-semibold">
              Review and create inquiry
            </Link>}
            {row.status === "new" && <button type="button" disabled={busyId !== null}
              onClick={() => void changeStatus(row, "contacted")}
              className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50">
              Mark contacted
            </button>}
            {row.status !== "closed" && <button type="button" disabled={busyId !== null}
              onClick={() => void changeStatus(row, "closed")}
              className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50">
              Close
            </button>}
          </div>
        </div>
        {row.message && <p className="mt-3 whitespace-pre-wrap text-sm">{row.message}</p>}
      </article>)}
      {items.length === 0 && <p className="text-sm text-muted-foreground">
        No public information requests in your authorized programs.
      </p>}
    </div>
  </section>;
}

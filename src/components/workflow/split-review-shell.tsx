import type { ReactNode } from "react";

export function SplitReviewShell({ recordTitle = "Submitted record", reviewTitle = "Review and decision", record, review, context }: {
  recordTitle?: string;
  reviewTitle?: string;
  record: ReactNode;
  review: ReactNode;
  context?: ReactNode;
}) {
  return <div className="space-y-6">
    {context}
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
      <section aria-label={recordTitle} className="min-w-0 rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
        <h2 className="mb-5 text-lg font-semibold">{recordTitle}</h2>{record}
      </section>
      <section aria-label={reviewTitle} className="min-w-0 rounded-2xl border bg-card p-5 shadow-sm sm:p-6 xl:sticky xl:top-6">
        <h2 className="mb-5 text-lg font-semibold">{reviewTitle}</h2>{review}
      </section>
    </div>
  </div>;
}

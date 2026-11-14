type CourseLessonProgressProps = {
  completed: number;
  total: number;
  ariaLabel: string;
  description: string;
};

/** Common lesson progress presentation for Section and standalone Course attempts. */
export function CourseLessonProgress({ completed, total, ariaLabel, description }: CourseLessonProgressProps) {
  const totalSafe = Number.isSafeInteger(total) && total > 0 ? total : 0;
  const done = Number.isSafeInteger(completed) ? Math.max(0,Math.min(completed,totalSafe)) : 0;
  const percent = totalSafe ? Math.round(done / totalSafe * 100) : 0;
  return <div className="space-y-2" aria-label="Course progress">
    <p className="text-xs font-semibold">Course progress</p>
    <div role="progressbar" aria-label={ariaLabel} aria-valuemin={0}
      aria-valuemax={totalSafe} aria-valuenow={done}
      aria-valuetext={`${done} of ${totalSafe} lessons complete`}
      className="h-1.5 bg-muted">
      <div className="h-full bg-primary" style={{width:`${percent}%`}}/>
    </div>
    <div className="flex justify-between gap-2 text-3xs text-muted-foreground">
      <span>{done} of {totalSafe} lessons</span><span>{percent}% complete</span>
    </div>
    <p className="text-3xs text-muted-foreground">{description}</p>
  </div>;
}

import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Canonical V6.1 destination card.
 * Presentational only: permissions and action eligibility remain server-owned.
 */
export function WorkspaceActionLink({
  title, description, href, actionLabel = "Continue", className,
}: {
  title: string;
  description?: string;
  href: string;
  actionLabel?: string;
  className?: string;
}) {
  return <div className={cn("flex min-w-0 flex-wrap items-center justify-between gap-3 border border-border bg-background p-4", className)}>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-semibold">{title}</p>
      {description && <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>}
    </div>
    <Button asChild variant="outline" size="sm" className="min-h-11">
      <a href={href}>{actionLabel}<ArrowRight aria-hidden="true" className="size-4" /></a>
    </Button>
  </div>;
}

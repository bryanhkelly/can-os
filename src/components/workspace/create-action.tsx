import { Plus } from "lucide-react";
import { cloneElement, type ReactElement, type ReactNode } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The module's principal creation entry point: one large blue button with a
 * plus icon, placed in the page header. Wrap a single `<Link>` (preferred, to a
 * dedicated create page) or `<button>`.
 */
export function CreateAction({ children }: { children: ReactElement }) {
  // The canonical Button owns visual treatments and link-style semantics.
  // Preserve the Link/button's original navigation and event props.
  const child = children as ReactElement<{ children?: ReactNode }>;
  return <Button asChild size="lg" data-create-action="" className="can-create-action">
    {cloneElement(child, undefined, <><Plus aria-hidden="true" />{child.props.children}</>)}
  </Button>;
}

/** Secondary header navigation next to a CreateAction; never styled as primary. */
export const secondaryActionClassName = cn(buttonVariants({ variant: "outline", size: "lg" }));

import { Slot, Slottable } from "@radix-ui/react-slot";
import { Plus } from "lucide-react";
import type { ReactElement } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The module's principal creation entry point: one large blue button with a
 * plus icon, placed in the page header. Wrap a single `<Link>` (preferred, to a
 * dedicated create page) or `<button>`.
 */
export function CreateAction({ children, className }: { children: ReactElement; className?: string }) {
  return <Slot data-create-action="" className={cn(buttonVariants({ size: "lg" }), "can-create-action", className)}>
    <Plus aria-hidden="true" />
    <Slottable>{children}</Slottable>
  </Slot>;
}

/** Secondary header navigation next to a CreateAction; never styled as primary. */
export const secondaryActionClassName = cn(buttonVariants({ variant: "outline", size: "lg" }));

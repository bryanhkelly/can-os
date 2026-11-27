import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { LoaderCircle } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { focusRingClasses } from "./control-styles";

const buttonVariants = cva(
  cn("inline-flex min-w-0 max-w-full shrink-0 items-center justify-center gap-2 whitespace-normal break-words text-center text-sm font-semibold transition-colors disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0", focusRingClasses),
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:underline underline-offset-4",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/75",
        outline: "border border-input bg-card text-foreground hover:bg-muted",
        ghost: "text-foreground hover:bg-muted",
        destructive: "bg-destructive text-destructive-foreground hover:underline underline-offset-4",
        "selection-chip": "border border-input bg-card text-foreground hover:bg-muted",
        "selection-chip-selected": "border border-primary bg-accent text-primary hover:bg-accent",
        "selection-chip-recommended": "border border-primary/60 bg-accent/50 text-primary hover:bg-accent",
        "local-tab": "border-b-2 border-transparent text-muted-foreground hover:text-foreground",
        "local-tab-selected": "border-b-2 border-primary text-primary",
      },
      size: {
        default: "min-h-10 px-4 py-2",
        sm: "min-h-9 px-3 text-xs",
        lg: "min-h-11 px-5",
        icon: "size-10",
        "chip-compact": "min-h-7 px-2 py-1 text-xs font-medium",
        "chip-standard": "min-h-9 px-3 py-1 text-sm font-medium",
        tab: "min-h-12 px-4 py-3 text-sm",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Native button pending state. Disables repeat submissions and announces busy. */
  loading?: boolean;
  loadingLabel?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, loading = false, loadingLabel, disabled, children, ...props }, ref) => {
    const inactive = disabled || loading;
    const filled = !variant || variant === "default" || variant === "secondary" || variant === "destructive";
    const classes = cn(buttonVariants({ variant, size }), className,
      inactive && (filled ? "bg-muted text-muted-foreground hover:bg-muted hover:no-underline" : "text-muted-foreground hover:no-underline"));
    // Radix Slot requires one element and doesn't confer native button
    // disabled semantics on an <a>. Give slotted actions the same pending
    // guard as native buttons, without emitting an invalid disabled attribute.
    if (asChild) {
      // Radix Slot gives child props precedence. Apply disabled semantics
      // directly to the child so an existing tabIndex/aria-disabled or
      // capture callback cannot re-enable a pending navigation.
      const child = React.Children.only(children) as React.ReactElement<{
        tabIndex?: number;
        "aria-disabled"?: React.AriaAttributes["aria-disabled"];
        onClickCapture?: React.MouseEventHandler<HTMLElement>;
      }>;
      const guardedChild = inactive ? React.cloneElement(child, {
        tabIndex: -1,
        "aria-disabled": true,
        onClickCapture: event => { event.preventDefault(); event.stopPropagation(); },
      }) : child;
      return <Slot ref={ref} {...props}
        className={cn(classes, inactive && "pointer-events-none")}
        aria-busy={loading || props["aria-busy"] || undefined}
        aria-disabled={inactive || props["aria-disabled"] || undefined}
        tabIndex={inactive ? -1 : props.tabIndex}
        onClickCapture={event => {
          if (inactive) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          props.onClickCapture?.(event as React.MouseEvent<HTMLButtonElement>);
        }}>{guardedChild}</Slot>;
    }
    return <button ref={ref} type={type ?? "button"} disabled={disabled || loading}
      aria-busy={loading || undefined} className={classes} {...props}>
      {loading && <LoaderCircle aria-hidden="true" className="animate-spin" />}
      {loading && loadingLabel ? loadingLabel : children}
    </button>;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };

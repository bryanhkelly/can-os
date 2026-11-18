import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { LoaderCircle } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/75",
        outline: "border border-border bg-card text-foreground hover:bg-muted",
        ghost: "text-foreground hover:bg-muted",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      },
      size: {
        default: "min-h-10 px-4 py-2",
        sm: "min-h-9 px-3 text-xs",
        lg: "min-h-11 px-5",
        icon: "size-10",
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
    const classes = cn(buttonVariants({ variant, size }), className);
    // Radix Slot requires exactly one React element, not an array containing
    // a false conditional spinner and the intended child link.
    if (asChild) {
      return <Slot ref={ref} aria-busy={loading || undefined}
        className={classes} {...props}>{children}</Slot>;
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

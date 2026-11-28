import * as React from "react";

import { cn } from "@/lib/utils";
import { fieldControlClasses, textEntryClasses } from "./control-styles";

export interface InputProps extends React.ComponentProps<"input"> {
  /** Reserve space for a decorative icon positioned by the field wrapper. */
  leadingIconInset?: boolean;
  /** Larger monospaced entry for short pairing or access codes. */
  presentation?: "standard" | "code";
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, leadingIconInset = false, presentation = "standard", ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex min-h-10 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          fieldControlClasses,
          textEntryClasses,
          leadingIconInset && "pl-10",
          presentation === "code" && "font-mono text-xl tracking-wider md:text-xl",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };

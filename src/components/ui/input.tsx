import * as React from "react";

import { cn } from "@/lib/utils";
import { fieldControlClasses, textEntryClasses } from "./control-styles";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex min-h-10 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          fieldControlClasses,
          textEntryClasses,
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

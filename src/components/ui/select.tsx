import * as React from "react";
import { cn } from "@/lib/utils";
import { fieldControlClasses } from "./control-styles";

const Select = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(
  ({ className, ...props }, ref) => <select ref={ref} className={cn(
    "flex min-h-10 text-sm", fieldControlClasses,
    className,
  )} {...props} />,
);
Select.displayName = "Select";

export { Select };

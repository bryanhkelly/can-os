import * as React from "react";

import { cn } from "@/lib/utils";
import { fieldControlClasses, textEntryClasses } from "./control-styles";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-20 resize-y",
        fieldControlClasses,
        textEntryClasses,
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };

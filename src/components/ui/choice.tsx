import { forwardRef, type ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { disabledControlClasses, focusRingClasses } from "./control-styles";

type ChoiceProps = Omit<ComponentProps<"input">, "type">;
const choiceClass = cn("size-4 shrink-0 accent-primary aria-invalid:ring-2 aria-invalid:ring-destructive",
  focusRingClasses, disabledControlClasses);

export const Checkbox = forwardRef<HTMLInputElement, ChoiceProps>(({ className, ...props }, ref) => (
  <input {...props} ref={ref} type="checkbox" className={cn(choiceClass, className)} />
));
Checkbox.displayName = "Checkbox";

export const Radio = forwardRef<HTMLInputElement, ChoiceProps>(({ className, ...props }, ref) => (
  <input {...props} ref={ref} type="radio" className={cn(choiceClass, className)} />
));
Radio.displayName = "Radio";

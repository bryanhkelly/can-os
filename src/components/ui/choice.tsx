import { forwardRef, type ComponentProps } from "react";
import { cn } from "@/lib/utils";

type ChoiceProps = Omit<ComponentProps<"input">, "type">;
const choiceClass = "size-4 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-destructive";

export const Checkbox = forwardRef<HTMLInputElement, ChoiceProps>(({ className, ...props }, ref) => (
  <input {...props} ref={ref} type="checkbox" className={cn(choiceClass, className)} />
));
Checkbox.displayName = "Checkbox";

export const Radio = forwardRef<HTMLInputElement, ChoiceProps>(({ className, ...props }, ref) => (
  <input {...props} ref={ref} type="radio" className={cn(choiceClass, className)} />
));
Radio.displayName = "Radio";

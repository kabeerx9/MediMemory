import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "@caretalk/ui/lib/utils";
import * as React from "react";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-sm border border-input bg-card px-3 py-2 text-base font-medium text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:shadow-[inset_0_2px_10px_rgba(0,0,0,0.08)] focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };

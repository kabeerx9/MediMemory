import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@health-conversation/ui/lib/utils";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding type-button-cap whitespace-nowrap transition-all outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary px-4 py-3 text-primary-foreground hover:bg-[var(--sentri-press-stronger)] hover:text-[var(--sentri-ink-press)] active:bg-[var(--sentri-press-stronger)] active:text-[var(--sentri-ink-press)]",
        inverted:
          "bg-primary-foreground px-4 py-3 text-[var(--sentri-ink-deep)] shadow-inverted-btn hover:bg-[var(--sentri-press-light)] hover:text-[var(--sentri-ink-press)] active:bg-[var(--sentri-press-light)]",
        outline: "border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "bg-[var(--surface-subtle)] px-2 py-2 text-foreground hover:bg-[var(--surface-hover)]",
        violet:
          "rounded-xl bg-[var(--sentri-accent-violet-mid)] px-4 py-2 text-sm font-medium tracking-[0.2px] text-primary-foreground uppercase hover:opacity-90",
        destructive: "bg-destructive/15 text-destructive hover:bg-destructive/25",
        link: "type-button-cap-light normal-case text-foreground underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 min-h-11 gap-2 px-4",
        sm: "h-9 min-h-9 gap-1.5 rounded-md px-3 text-xs",
        lg: "h-12 min-h-12 gap-2 rounded-md px-5",
        icon: "size-11 rounded-md",
        "icon-sm": "size-9 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };

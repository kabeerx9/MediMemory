import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@caretalk/ui/lib/utils";

const badgeVariants = cva(
  "group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap transition-all [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "rounded-xs bg-primary px-2 py-1 text-sm text-primary-foreground",
        lime: "rounded-xs bg-sentri-lime px-3 py-0 text-sm font-bold text-[var(--sentri-ink-deep)]",
        violet:
          "rounded-xl bg-[var(--sentri-accent-violet-mid)] px-4 py-1 text-sm font-medium tracking-[0.2px] text-primary-foreground uppercase",
        outline: "rounded-xs border border-border px-2 py-1 text-sm text-foreground",
        muted: "rounded-xs bg-muted px-2 py-1 text-sm text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props,
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  });
}

export { Badge, badgeVariants };

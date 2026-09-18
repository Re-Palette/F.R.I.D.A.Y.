import { type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  raised?: boolean;
  glow?: boolean;
}

/**
 * Base surface for all chrome: near-black fill, 1px hairline border,
 * minimal radius. No drop shadows — emphasis comes from an optional
 * amber glow, never elevation.
 */
export function Panel({ raised, glow, className, ...props }: PanelProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border border-border",
        raised ? "bg-panel-raised" : "bg-panel",
        glow && "shadow-[var(--glow-accent-soft)]",
        className
      )}
      {...props}
    />
  );
}

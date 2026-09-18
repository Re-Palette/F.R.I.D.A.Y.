import { type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface MinimalButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "ghost" | "outline" | "accent";
}

/**
 * Text-forward button per the reference design — no filled pill buttons.
 * Ghost: bare tracked-out label. Outline: hairline border. Accent: for the
 * rare primary action, amber text + border glow on hover.
 */
export function MinimalButton({ variant = "outline", className, ...props }: MinimalButtonProps) {
  return (
    <button
      className={cn(
        "px-4 py-2 text-[11px] uppercase tracking-[var(--tracking-wide)] transition-colors",
        variant === "ghost" && "text-fg-muted hover:text-fg",
        variant === "outline" &&
          "border border-border text-fg-muted hover:border-border-strong hover:text-fg",
        variant === "accent" &&
          "border border-accent-dim text-accent hover:shadow-[var(--glow-accent-soft)]",
        className
      )}
      {...props}
    />
  );
}

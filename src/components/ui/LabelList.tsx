import { cn } from "@/lib/cn";

export interface LabelListItem {
  label: string;
  active?: boolean;
}

interface LabelListProps {
  items: LabelListItem[];
  align?: "left" | "right";
  className?: string;
}

/**
 * The side "ANALYZING / COLLECTING / LEARNING" motif from the reference
 * image: a tick bar next to tracked-out uppercase labels. Reused for
 * agent status (what's running now) and capability lists.
 */
export function LabelList({ items, align = "left", className }: LabelListProps) {
  return (
    <ul className={cn("flex flex-col gap-2", className)}>
      {items.map((item) => (
        <li
          key={item.label}
          className={cn(
            "flex items-center gap-2 text-[11px] tracking-[var(--tracking-wide)] uppercase",
            align === "right" && "flex-row-reverse",
            item.active ? "text-fg" : "text-fg-faint"
          )}
        >
          <span
            className={cn(
              "h-[10px] w-[2px] shrink-0",
              item.active ? "bg-accent shadow-[var(--glow-accent-soft)]" : "bg-fg-faint"
            )}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

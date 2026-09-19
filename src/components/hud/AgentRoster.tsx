"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HudPanel } from "./HudPanel";
import { cn } from "@/lib/cn";

/**
 * AGENT ROSTER.
 *
 * Styled as a system module rather than a menu, as the reference has it —
 * but every row goes somewhere this app actually has. Rows labelled Search
 * or Analyze that led nowhere would be exactly the invented content the
 * rest of this screen avoids.
 */
const ROSTER = [
  { label: "F.R.I.D.A.Y.", href: "/", note: "CORE" },
  { label: "CHAT", href: "/chat", note: "会話履歴" },
  { label: "DOCS", href: "/documents", note: "資料" },
  { label: "PLANS", href: "/plans", note: "計画" },
  { label: "TASKS", href: "/tasks", note: "予定タスク" },
  { label: "APPROVALS", href: "/approvals", note: "承認待ち" },
];

export function AgentRoster() {
  const pathname = usePathname();

  return (
    <HudPanel title="AGENT ROSTER" bodyClassName="flex flex-col py-1.5">
      {ROSTER.map(({ label, href, note }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-2.5 px-3 py-[5px] transition-colors",
              active ? "text-[var(--hud-orange-bright)]" : "text-[var(--hud-text-dim)] hover:text-[var(--hud-orange)]"
            )}
          >
            <span
              className={cn(
                "flex h-[11px] w-[11px] shrink-0 items-center justify-center rounded-full border",
                active
                  ? "border-[var(--hud-orange)] shadow-[0_0_7px_rgba(255,122,26,0.8)]"
                  : "border-[var(--hud-orange-dim)]"
              )}
            >
              {active && <span className="h-[5px] w-[5px] rounded-full bg-[var(--hud-orange)]" />}
            </span>
            <span className="font-[family-name:var(--font-hud)] text-[10px] tracking-[0.16em]">{label}</span>
            <span className="ml-auto text-[9px] text-[var(--hud-orange-dim)] opacity-0 transition-opacity group-hover:opacity-100">
              {note}
            </span>
          </Link>
        );
      })}
    </HudPanel>
  );
}

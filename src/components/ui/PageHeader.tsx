import Link from "next/link";

/**
 * The header every list screen shares: the mark, what you're looking at, and
 * the way back. Lettered like the HUD's own header so arriving here from the
 * command screen doesn't feel like leaving the same application.
 */
export function PageHeader({ label, backHref = "/", backLabel = "HOME" }: {
  label: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <header className="mb-8 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="relative flex h-6 w-6 items-center justify-center">
          <span className="absolute inset-0 rotate-45 border border-[var(--hud-orange)] shadow-[var(--hud-glow)]" />
          <span className="h-[5px] w-[5px] rounded-full bg-[var(--hud-orange)]" />
        </span>
        <span className="font-[family-name:var(--font-hud)] text-[10px] tracking-[0.2em] text-[var(--hud-orange)]">
          {label}
        </span>
        <span className="h-px w-16 bg-[var(--hud-line)] sm:w-40" />
      </div>
      <Link
        href={backHref}
        className="font-[family-name:var(--font-hud)] text-[10px] tracking-[0.2em] text-[var(--hud-text-dim)] hover:text-[var(--hud-orange)]"
      >
        {backLabel}
      </Link>
    </header>
  );
}

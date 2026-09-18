import Link from "next/link";

/**
 * The header every list screen shares: the mark, what you're looking at, and
 * the way back. Extracted once a fourth screen wanted the same eleven lines.
 */
export function PageHeader({ label, backHref = "/", backLabel = "HOME" }: {
  label: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <header className="mb-8 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border-strong text-[10px] text-accent">
          F
        </span>
        <span className="text-[10px] tracking-[var(--tracking-wider)] text-fg-muted">{label}</span>
      </div>
      <Link
        href={backHref}
        className="text-[10px] tracking-[var(--tracking-wider)] text-fg-muted hover:text-fg"
      >
        {backLabel}
      </Link>
    </header>
  );
}

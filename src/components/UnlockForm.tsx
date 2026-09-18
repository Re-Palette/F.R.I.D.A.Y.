"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MinimalButton } from "@/components/ui/MinimalButton";
import { StatusRing } from "@/components/ui/StatusRing";

export function UnlockForm() {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!passcode || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      // The cookie is set now, so a server-rendered navigation will pass.
      router.replace("/");
      router.refresh();
    } catch (err) {
      console.error("Unlock failed:", err);
      setError(err instanceof Error ? err.message : "解除できませんでした。");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6">
      <StatusRing size={140} />

      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-light tracking-[var(--tracking-wider)]">F.R.I.D.A.Y.</h1>
        <p className="text-[11px] tracking-[var(--tracking-wide)] text-fg-muted">
          パスコードを入力してください
        </p>
      </div>

      <form onSubmit={submit} className="flex w-full max-w-xs flex-col items-center gap-4">
        <input
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          autoFocus
          autoComplete="current-password"
          className="w-full border-b border-border bg-transparent py-2 text-center text-sm text-fg outline-none transition-colors focus:border-accent-dim"
        />
        <MinimalButton type="submit" variant="accent" disabled={busy || !passcode}>
          {busy ? "確認中…" : "解除"}
        </MinimalButton>
        {error && <p className="text-[11px] text-fg-muted">{error}</p>}
      </form>

      <p className="max-w-xs text-center text-[10px] leading-relaxed text-fg-faint">
        一度解除すれば、このブラウザでは次回から入力は不要です。
      </p>
    </div>
  );
}

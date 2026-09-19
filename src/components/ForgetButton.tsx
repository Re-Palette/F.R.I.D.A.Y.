"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MinimalButton } from "@/components/ui/MinimalButton";

export function ForgetButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function forget() {
    setBusy(true);
    try {
      const res = await fetch(`/api/memories/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.refresh();
    } catch (err) {
      console.error("Failed to forget:", err);
      setBusy(false);
    }
  }

  return (
    <MinimalButton variant="ghost" disabled={busy} onClick={forget} className="shrink-0">
      忘れる
    </MinimalButton>
  );
}

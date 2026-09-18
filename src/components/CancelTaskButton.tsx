"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MinimalButton } from "@/components/ui/MinimalButton";

export function CancelTaskButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function cancel() {
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.refresh();
    } catch (err) {
      console.error("Failed to cancel task:", err);
      setBusy(false);
    }
  }

  return (
    <MinimalButton variant="ghost" disabled={busy} onClick={cancel} className="shrink-0">
      取り消し
    </MinimalButton>
  );
}

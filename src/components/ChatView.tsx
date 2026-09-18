"use client";

import { useEffect, useRef, useState } from "react";
import { ChatInputLine } from "@/components/ui/ChatInputLine";
import { Panel } from "@/components/ui/Panel";
import { cn } from "@/lib/cn";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
}

interface ChatViewProps {
  conversationId: string;
  initialMessages: ChatMessage[];
}

export function ChatView({ conversationId, initialMessages }: ChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [pending, setPending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sentPendingRef = useRef(false);

  async function send(content: string) {
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content }]);
    setPending(true);

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, content }),
      });
      // Without this, an error response (whose body Next leaves empty) was
      // read as a perfectly normal stream that happened to contain nothing,
      // and the assistant bubble just stayed blank.
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      if (!res.body) throw new Error("no stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: acc } : m))
        );
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: `（エラー: ${detail}）` } : m))
      );
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    if (sentPendingRef.current) return;
    const key = `friday:pending:${conversationId}`;
    const pendingMessage = sessionStorage.getItem(key);
    if (pendingMessage) {
      sentPendingRef.current = true;
      sessionStorage.removeItem(key);
      queueMicrotask(() => void send(pendingMessage));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-1 flex-col px-6 py-6 sm:px-12">
      <header className="mb-6 flex items-center gap-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border-strong text-[10px] text-accent">
          F
        </span>
        <span className="text-[10px] tracking-[var(--tracking-wider)] text-fg-muted">
          F.R.I.D.A.Y.
        </span>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto">
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            {m.role === "user" ? (
              <div className="max-w-[70%] text-sm text-fg">{m.content}</div>
            ) : (
              <Panel className="max-w-[70%] px-4 py-3 text-sm text-fg whitespace-pre-wrap">
                {m.content || (pending ? "…" : "")}
              </Panel>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="mx-auto mt-6 w-full max-w-2xl">
        <ChatInputLine onSubmit={send} disabled={pending} />
      </div>
    </div>
  );
}

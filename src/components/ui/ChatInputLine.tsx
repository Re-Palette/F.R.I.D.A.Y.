"use client";

import { useState, type FormEvent } from "react";
import { cn } from "@/lib/cn";

interface ChatInputLineProps {
  onSubmit: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * The minimal bottom input from the reference design language: an
 * underline field rather than a rounded chat bubble input.
 */
export function ChatInputLine({ onSubmit, disabled, placeholder }: ChatInputLineProps) {
  const [value, setValue] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue("");
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div
        className={cn(
          "flex items-center gap-3 border-b border-border-strong pb-3 transition-colors",
          "focus-within:border-accent-dim"
        )}
      >
        <span className="text-accent text-sm select-none">›</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
          placeholder={placeholder ?? "F.R.I.D.A.Y.に話しかける…"}
          className="flex-1 bg-transparent text-sm text-fg placeholder:text-fg-faint outline-none disabled:opacity-50"
        />
      </div>
    </form>
  );
}

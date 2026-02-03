// src/components/TransactionModal.jsx
import React, { useEffect } from "react";

import Transaction from "./Transaction";
import TransactionManual from "./TransactionManual";

export default function TransactionModal({
  open,
  onClose,
  initialTranscript = "",
  mode = "voice", // "voice" | "text"
  userId = "usr001",
  corebankData = null,
}) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[999]">
      {/* overlay */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* center container */}
      <div className="absolute inset-0 flex items-center justify-center p-2">
        {/* ✅ WIDE + SHORT PANEL */}
        <div
          className={[
            "w-[min(1100px,96vw)] max-w-none",
            "max-h-[92vh] lg:max-h-[78vh]",
            "rounded-2xl bg-white shadow-2xl border border-zinc-200 overflow-hidden",
            "flex flex-col",
          ].join(" ")}
          onClick={(e) => e.stopPropagation()}
        >
          {/* header (fixed) */}
          <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-blue-50 via-teal-50 to-white border-b border-zinc-200 shrink-0">
            <div>
              <div className="text-sm font-bold text-zinc-900">🏦 Transfer</div>
              <div className="text-[11px] text-zinc-600">From • To • Amount • Memo</div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs hover:bg-zinc-50"
              title="Close"
            >
              ✕
            </button>
          </div>

          {/* ✅ body (SCROLLABLE) */}
          <div className="p-3 flex-1 min-h-0 overflow-y-auto">
            {mode === "text" ? (
              <TransactionManual
                initialTranscript={initialTranscript}
                userId={userId}
                corebankData={corebankData}
                onClose={onClose}
              />
            ) : (
              <Transaction
                initialTranscript={initialTranscript}
                userId={userId}
                corebankData={corebankData}
                onClose={onClose}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

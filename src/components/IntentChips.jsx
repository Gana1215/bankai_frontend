// ===============================================
// 💬 IntentChips.jsx — v2.0 (1:1 Direct-Intent Edition)
// ✅ Sends structured payload: { intent, source: "clarify_click" }
// ✅ Keeps full dynamic data from backend /list_intents
// ✅ Works both for clarify chips and quick-access buttons
// ===============================================

import React from "react";

export default function IntentChips({ intents, onPick }) {
  if (!intents?.length) return null;

  return (
    <div className="w-full overflow-x-auto no-scrollbar py-2">
      <div className="flex gap-2 min-w-max">
        {intents.map((it) => (
          <button
            key={it.name || it.key}
            onClick={() =>
              onPick({
                intent: it.name || it.key,      // 🔹 backend key (e.g., "open_account")
                source: "clarify_click",        // 🔹 signals 1:1 intent path
              })
            }
            className="px-3 py-1.5 rounded-2xl bg-blue-100 text-blue-700 border border-blue-200 hover:bg-blue-200 active:scale-[.98] transition whitespace-nowrap"
            title={it.title || it.display}
          >
            {it.title || it.display}
          </button>
        ))}
      </div>
    </div>
  );
}

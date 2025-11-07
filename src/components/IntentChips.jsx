import React from "react";

export default function IntentChips({ intents, onPick }) {
  if (!intents?.length) return null;
  return (
    <div className="w-full overflow-x-auto no-scrollbar py-2">
      <div className="flex gap-2 min-w-max">
        {intents.map((it) => (
          <button
            key={it.key}
            onClick={() => onPick(it.sample_text || it.title)}
            className="px-3 py-1.5 rounded-2xl bg-blue-100 text-blue-700 border border-blue-200 hover:bg-blue-200 active:scale-[.98] transition whitespace-nowrap"
            title={it.title}
          >
            {it.title}
          </button>
        ))}
      </div>
    </div>
  );
}

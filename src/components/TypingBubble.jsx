import React from "react";

export default function TypingBubble() {
  return (
    <div className="flex gap-2 items-end">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-teal-400 animate-pulse shadow-md" />
      <div className="max-w-[75%] backdrop-blur-md bg-white/60 border border-white/40 rounded-2xl px-4 py-3 shadow">
        <span className="inline-flex gap-1">
          <span className="w-2 h-2 rounded-full bg-gray-500 animate-bounce [animation-delay:0ms]" />
          <span className="w-2 h-2 rounded-full bg-gray-500 animate-bounce [animation-delay:120ms]" />
          <span className="w-2 h-2 rounded-full bg-gray-500 animate-bounce [animation-delay:240ms]" />
        </span>
      </div>
    </div>
  );
}

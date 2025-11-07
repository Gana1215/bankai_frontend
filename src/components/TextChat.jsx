import React, { useState } from "react";

export default function TextChat({ onSend }) {
  const [text, setText] = useState("");

  const send = () => {
    if (text.trim()) {
      onSend(text.trim());
      setText("");
    }
  };

  return (
    <div className="mt-4 flex gap-2">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && send()}
        placeholder="Type your message…"
        className="flex-1 px-4 py-2 rounded-2xl border border-blue-200 bg-white/80 backdrop-blur focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
      <button
        onClick={send}
        className="px-5 py-2 rounded-2xl bg-blue-600 text-white shadow hover:bg-blue-700 active:scale-[.98] transition"
      >
        Send
      </button>
    </div>
  );
}

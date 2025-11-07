import React from "react";

export default function Bubble({ from, children }) {
  const isUser = from === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} w-full`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-teal-400 mr-2 shadow-md" />
      )}
      <div
        className={`max-w-[75%] backdrop-blur-md ${
          isUser
            ? "bg-blue-600/90 text-white"
            : "bg-white/60 text-blue-950"
        } border ${
          isUser ? "border-blue-300/40" : "border-white/40"
        } rounded-2xl px-4 py-3 shadow leading-relaxed whitespace-pre-line`}
      >
        {children}
      </div>
    </div>
  );
}

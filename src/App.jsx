// ===============================================
// 💬 BankAI — Dual Reply + Auto Voice (v3.4)
// -----------------------------------------------
// ✅ Auto voice playback on iPhone/Android/desktop
// ✅ Silent AudioContext unlock (no tap needed)
// ✅ Elegant text + amplitude design
// ✅ Displays formatted balance below main phrase
// ===============================================

import React, { useState, useEffect } from "react";
import Recorder from "./components/Recorder";
import { API_BASE } from "./utils/api";
import "./components/amplitude.css";

export default function App() {
  const [reply, setReply] = useState(null);
  const [balanceText, setBalanceText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const showToast = (msg, timeout = 2500) => {
    setToast(msg);
    setTimeout(() => setToast(""), timeout);
  };

  // 🎧 Voice auto-play (mobile-safe, no tap needed)
  useEffect(() => {
    if (!reply?.voice_url) return;

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    // Silent audio context unlock for iOS/Android
    const unlockAudioContext = () => {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContext();
        const buffer = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(ctx.destination);
        src.start(0);
        if (ctx.state === "suspended") ctx.resume();
        console.log("🔓 Audio context unlocked for mobile");
      } catch (e) {
        console.warn("⚠️ Audio context unlock failed:", e);
      }
    };

    const playVoices = async () => {
      try {
        if (isMobile) unlockAudioContext();

        const phrase = new Audio(`${API_BASE}${reply.voice_url}`);
        await phrase.play();

        if (reply.balance_amount && reply.balance_amount.endsWith(".wav")) {
          const amount = new Audio(`${API_BASE}${reply.balance_amount}`);
          await amount.play();
        }

        console.log("🎵 BankAI voice reply played");
      } catch (e) {
        console.warn("🔇 Auto-play blocked or failed:", e);
      }
    };

    // small delay for mobile audio engine readiness
    setTimeout(playVoices, isMobile ? 400 : 100);
    showToast("🎧 BankAI is replying...");
  }, [reply]);

  // 💰 Load balance text (from .txt or direct string)
  useEffect(() => {
    const loadBalance = async () => {
      if (reply?.balance_amount && reply.balance_amount.endsWith(".txt")) {
        try {
          const res = await fetch(`${API_BASE}${reply.balance_amount}`);
          const txt = await res.text();
          setBalanceText(txt.trim());
        } catch (e) {
          console.warn("⚠️ Failed to load balance text:", e);
          setBalanceText("");
        }
      } else if (
        typeof reply?.balance_amount === "string" &&
        !reply.balance_amount.endsWith(".wav")
      ) {
        setBalanceText(reply.balance_amount);
      } else {
        setBalanceText("");
      }
    };
    loadBalance();
  }, [reply]);

  const handleStop = async (blob) => {
    if (!blob) return;
    setLoading(true);
    setError("");
    setReply(null);
    setBalanceText("");
    showToast("📤 Sending your voice to BankAI...");

    try {
      const formData = new FormData();
      formData.append("user_id", "usr001");
      formData.append("file", blob, "intent.wav");

      const res = await fetch(`${API_BASE}/intent/voice_intent`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      setReply(data);
      showToast("✅ BankAI replied.");
    } catch (err) {
      console.error("❌ API error:", err);
      setError("⚠️ Сервертэй холбогдоход алдаа гарлаа. Дахин оролдоно уу.");
      showToast("❌ Connection failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-blue-100 font-sans text-center px-4">
      {/* 🤖 Header */}
      <h1 className="text-3xl sm:text-4xl font-bold text-blue-700 mb-2 drop-shadow-sm">
        🤖 BankAI — Intelligent Assistant
      </h1>
      <p className="text-gray-600 text-lg italic mb-10">
        “Танд юугаар туслах вэ?”
      </p>

      {/* 🎙️ Recorder */}
      <Recorder onStop={handleStop} />

      {/* 💭 Toast */}
      {toast && (
        <div className="mt-6 bg-blue-50 border border-blue-300 text-blue-700 px-4 py-2 rounded-xl shadow-sm animate-fade">
          {toast}
        </div>
      )}

      {/* ⏳ Animated amplitude */}
      {loading && (
        <div className="mt-10 flex flex-col items-center justify-center animate-fade">
          <div className="amp-wrap">
            <div className="amp-bars" aria-hidden>
              <span /><span /><span /><span /><span />
            </div>
            <div className="amp-label">Банк хариулж байна…</div>
          </div>
        </div>
      )}

      {/* ⚠️ Error */}
      {error && (
        <p className="mt-6 bg-red-100 border border-red-300 text-red-600 px-4 py-2 rounded-xl shadow-sm">
          {error}
        </p>
      )}

      {/* 💬 BankAI Reply */}
      {reply && !loading && (
        <div className="mt-10 bg-white shadow-lg rounded-2xl p-6 w-full max-w-md animate-fade">
          <p className="text-gray-800 text-xl leading-relaxed font-medium mb-3 transition-opacity duration-500">
            {reply.reply_text || "Хариулт ирсэнгүй."}
          </p>

          {balanceText && (
            <div className="text-3xl font-bold text-blue-700 mt-1 mb-3 tracking-wide drop-shadow-sm">
              {balanceText} ₮
            </div>
          )}

          {reply.pdf_url && (
            <a
              href={`${API_BASE}${reply.pdf_url}`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-blue-600 underline hover:text-blue-800"
            >
              📄 Хавсралт (PDF) үзэх
            </a>
          )}
        </div>
      )}

      {/* 🪶 Footer */}
      <footer className="mt-12 text-gray-400 text-sm">
        © 2025 BankAI Assistant — Gana & Prof ☕
      </footer>

      {/* ✨ Fade animation */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .animate-fade { animation: fadeIn 0.6s ease-in-out; }
      `}</style>
    </div>
  );
}

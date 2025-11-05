// ===============================================
// 💬 BankAI — Elegant Blue-Teal Edition (v3.8)
// -----------------------------------------------
// ✅ Same logic as v3.5 (no functional changes)
// ✅ Adds beautiful gradient, animation, and glow
// ✅ Smooth reply card + animated info lines
// ✅ Mobile-safe, iOS-safe voice playback
// ===============================================

import React, { useState, useEffect, useRef } from "react";
import Recorder from "./components/Recorder";
import { API_BASE } from "./utils/api";
import "./components/amplitude.css";

export default function App() {
  const [reply, setReply] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const audioCtxRef = useRef(null);

  // 🔓 Persistent unlocked audio context for mobile
  useEffect(() => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
      const unlock = () => {
        const buffer = audioCtxRef.current.createBuffer(1, 1, 22050);
        const src = audioCtxRef.current.createBufferSource();
        src.buffer = buffer;
        src.connect(audioCtxRef.current.destination);
        src.start(0);
        if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume();
      };
      window.addEventListener("touchstart", unlock, { once: true });
      window.addEventListener("click", unlock, { once: true });
    } catch (e) {
      console.warn("⚠️ AudioContext unlock failed:", e);
    }
  }, []);

  const showToast = (msg, timeout = 2500) => {
    setToast(msg);
    setTimeout(() => setToast(""), timeout);
  };

  // 🎧 Voice auto-play (safe timing)
  useEffect(() => {
    if (!reply?.voice_url) return;
    const playVoice = async () => {
      try {
        const audio = new Audio(`${API_BASE}${reply.voice_url}`);
        await audio.play();
        console.log("🎵 Static voice played OK");
      } catch (err) {
        console.warn("🔇 Voice auto-play blocked:", err);
      }
    };
    setTimeout(playVoice, 600);
    showToast("🎧 BankAI is replying...");
  }, [reply]);

  const handleStop = async (blob) => {
    if (!blob) return;
    setLoading(true);
    setError("");
    setReply(null);
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-blue-50 via-teal-50 to-white font-sans text-center px-4">
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

      {/* ⏳ Loading animation */}
      {loading && (
        <div className="mt-10 flex flex-col items-center justify-center animate-fade">
          <div className="amp-wrap">
            <div className="amp-bars" aria-hidden>
              <span /><span /><span /><span /><span />
            </div>
            <div className="amp-label text-blue-700">Банк хариулж байна…</div>
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
        <div className="mt-10 bg-gradient-to-br from-white via-blue-50 to-teal-50 shadow-xl rounded-2xl p-6 w-full max-w-md animate-slide-up border border-blue-100">
          {/* 🧠 Main reply text */}
          <p className="text-blue-900 text-xl font-semibold mb-4 whitespace-pre-line leading-relaxed text-left border-l-4 border-blue-500 pl-4 bg-blue-50/60 rounded-md py-2 shadow-sm">
            {reply.reply_text || "Хариулт ирсэнгүй."}
          </p>

          {/* 🔹 Dynamic key-value CoreBank data */}
          {reply.corebank_data && (
            <div className="mt-2 space-y-2 text-left">
              {Object.entries(reply.corebank_data).map(([k, v], idx) => (
                <div
                  key={k}
                  className="flex justify-between items-center bg-gradient-to-r from-teal-50 to-blue-50 rounded-lg px-4 py-2 shadow-sm border border-blue-100 opacity-0 animate-fade-in"
                  style={{ animationDelay: `${idx * 0.1}s` }}
                >
                  <span className="text-gray-700 font-medium capitalize tracking-wide">
                    {k.replace(/_/g, " ")}
                  </span>
                  <span className="text-blue-700 font-semibold">{v}</span>
                </div>
              ))}
            </div>
          )}

          {/* 📄 PDF Link */}
          {reply.pdf_url && (
            <a
              href={`${API_BASE}${reply.pdf_url}`}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-block text-teal-600 underline hover:text-teal-800 font-medium transition-colors"
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

      {/* ✨ Animations */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .animate-fade { animation: fadeIn 0.6s ease-in-out; }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slideUp 0.7s ease-out;
        }

        @keyframes fadeInItem {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fadeInItem 0.6s ease-in-out forwards;
        }
      `}</style>
    </div>
  );
}

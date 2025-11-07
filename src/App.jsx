// ===============================================
// 💬 BankAI — Elegant Blue-Teal Edition (v4.1 Final)
// -----------------------------------------------
// ✅ Same backend logic (v3.9)
// ✅ Hardened mobile MP3 autoplay (iOS/Android)
// ✅ Shared <audio> element + WebAudio fallback
// ✅ No functional UI changes, fully mobile-safe
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

  // 🔉 Audio plumbing
  const audioCtxRef = useRef(null);     // persistent AudioContext (iOS unlock)
  const audioRef = useRef(null);        // shared <audio> element
  const gainRef = useRef(null);         // WebAudio fallback gain
  const srcNodeRef = useRef(null);      // WebAudio fallback buffer source
  const playingViaWebAudioRef = useRef(false);

  // 🔓 Persistent unlocked audio context (iOS-safe)
  useEffect(() => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
      gainRef.current = audioCtxRef.current.createGain();
      gainRef.current.connect(audioCtxRef.current.destination);
      const unlock = async () => {
        try {
          // micro-beep to unlock
          const ctx = audioCtxRef.current;
          const b = ctx.createBuffer(1, 1, 22050);
          const s = ctx.createBufferSource();
          s.buffer = b;
          s.connect(ctx.destination);
          s.start(0);
          if (ctx.state === "suspended") await ctx.resume();
        } catch (e) {
          console.warn("⚠️ AudioContext unlock failed:", e);
        }
      };
      window.addEventListener("touchstart", unlock, { once: true, passive: true });
      window.addEventListener("click", unlock, { once: true });
    } catch (e) {
      console.warn("⚠️ AudioContext init failed:", e);
    }
  }, []);

  // Create a single shared <audio> once
  useEffect(() => {
    const el = new Audio();
    el.setAttribute("playsinline", "true");
    el.preload = "auto";
    el.crossOrigin = "anonymous";
    audioRef.current = el;
    return () => {
      el.pause();
      el.src = "";
      audioRef.current = null;
    };
  }, []);

  const showToast = (msg, timeout = 2500) => {
    setToast(msg);
    setTimeout(() => setToast(""), timeout);
  };

  // 🛑 Stop any in-flight audio (element or WebAudio)
  const stopAllAudio = () => {
    try {
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    } catch {}
    try {
      if (srcNodeRef.current) {
        srcNodeRef.current.stop(0);
        srcNodeRef.current.disconnect();
        srcNodeRef.current = null;
        playingViaWebAudioRef.current = false;
      }
    } catch {}
  };

  // 🎧 Robust voice auto-play (mobile-safe with fallback)
  useEffect(() => {
    if (!reply?.voice_url) return;

    const playVoice = async () => {
      const url = `${API_BASE}${reply.voice_url}`;
      stopAllAudio();

      // 1) Try native <audio> element first
      try {
        const audio = audioRef.current;
        audio.src = url;
        // Prime the element to reduce decode lag on iOS
        audio.load();
        await audio.play();
        console.log("🎵 MP3 via <audio> played OK");
        return;
      } catch (err1) {
        console.warn("🔇 <audio>.play() blocked or failed, retrying…", err1);
      }

      // 2) Resume context and retry once
      try {
        if (audioCtxRef.current?.state === "suspended") {
          await audioCtxRef.current.resume();
        }
        const audio = audioRef.current;
        await audio.play();
        console.log("🎵 MP3 via <audio> played after resume()");
        return;
      } catch (err2) {
        console.warn("🔇 Retry after resume() failed, falling back to WebAudio…", err2);
      }

      // 3) WebAudio fallback: fetch → decode → play
      try {
        const res = await fetch(url, { cache: "no-store" });
        const arr = await res.arrayBuffer();
        const buf = await audioCtxRef.current.decodeAudioData(arr);
        const src = audioCtxRef.current.createBufferSource();
        src.buffer = buf;
        src.connect(gainRef.current);
        srcNodeRef.current = src;
        playingViaWebAudioRef.current = true;
        src.start(0);
        console.log("🎵 MP3 decoded and played via WebAudio");
      } catch (err3) {
        console.error("❌ WebAudio fallback failed:", err3);
      }
    };

    // tiny delay lets the UI toast show first & helps iOS timing
    setTimeout(playVoice, 450);
    showToast("🎧 BankAI is replying...");
  }, [reply]);

  const handleStop = async (blob) => {
    if (!blob) return;
    setLoading(true);
    setError("");
    setReply(null);
    stopAllAudio();
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
      <p className="text-gray-600 text-lg italic mb-10">“Танд юугаар туслах вэ?”</p>

      {/* 🎙️ Recorder */}
      <Recorder onStop={handleStop} />

      {/* 💭 Toast with animated 🔊 speaker */}
      {toast && (
        <div className="mt-6 bg-blue-50 border border-blue-300 text-blue-700 px-5 py-2 rounded-xl shadow-sm animate-fade flex items-center justify-center gap-2">
          {toast.includes("replying") ? (
            <>
              <span className="speaker-icon relative flex items-center justify-center w-5 h-5">
                <span className="block w-2 h-2 bg-blue-600 rounded-sm"></span>
                <span className="wave wave1 absolute bg-blue-400"></span>
                <span className="wave wave2 absolute bg-blue-300"></span>
              </span>
              <span>{toast}</span>
            </>
          ) : (
            toast
          )}
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
          {/* 🧠 Main reply text (skip if duplicated) */}
          {reply.reply_text &&
            (!reply.corebank_data || Object.keys(reply.corebank_data).length === 0) && (
              <p className="text-blue-900 text-xl font-semibold mb-4 whitespace-pre-line leading-relaxed text-left border-l-4 border-blue-500 pl-4 bg-blue-50/60 rounded-md py-2 shadow-sm">
                {reply.reply_text || "Хариулт ирсэнгүй."}
              </p>
            )}

          {/* 🔹 Optional multi-intent list if backend ever sends it */}
          {Array.isArray(reply.intent_choices) && reply.intent_choices.length > 0 && (
            <ul className="text-left list-disc list-inside text-blue-900/90 space-y-1 mb-3">
              {reply.intent_choices.map((opt, i) => (
                <li key={i}>{opt}</li>
              ))}
            </ul>
          )}

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
        .animate-slide-up { animation: slideUp 0.7s ease-out; }

        @keyframes fadeInItem {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in { animation: fadeInItem 0.6s ease-in-out forwards; }

        /* 🔊 Speaker wave animation */
        .wave {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          opacity: 0.6;
          animation: pulse 1.2s infinite ease-in-out;
        }
        .wave1 { animation-delay: 0s; }
        .wave2 { animation-delay: 0.6s; }

        @keyframes pulse {
          0% { transform: scale(0.6); opacity: 0.7; }
          50% { transform: scale(1.4); opacity: 0.4; }
          100% { transform: scale(0.6); opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}

// ===============================================
// 💬 BankAI — Phase 2A Chatbot (Dynamic Intents + Typing + Fade + AutoScroll)
// -----------------------------------------------
// ✅ Dynamic intent buttons from backend
// ✅ "BankAI is typing…" animation
// ✅ Auto-scroll to bottom of chat
// ✅ Smooth fade-in bubbles, responsive layout
// ✅ Scrollable chat container (maxHeight + overflow-y)
// ===============================================

import React, { useState, useEffect, useRef } from "react";
import Recorder from "./components/Recorder";
import { API_BASE } from "./utils/api";
import "./components/amplitude.css";

// ====================================================
// 🎙 Voice Chat — unchanged
// ====================================================
function VoiceChat({ onBack }) {
  const [reply, setReply] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const audioCtxRef = useRef(null);
  const audioRef = useRef(null);
  const gainRef = useRef(null);
  const srcNodeRef = useRef(null);

  useEffect(() => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
      gainRef.current = audioCtxRef.current.createGain();
      gainRef.current.connect(audioCtxRef.current.destination);
      const unlock = async () => {
        try {
          const ctx = audioCtxRef.current;
          const b = ctx.createBuffer(1, 1, 22050);
          const s = ctx.createBufferSource();
          s.buffer = b;
          s.connect(ctx.destination);
          s.start(0);
          if (ctx.state === "suspended") await ctx.resume();
        } catch (e) {}
      };
      window.addEventListener("touchstart", unlock, { once: true });
      window.addEventListener("click", unlock, { once: true });
    } catch {}
  }, []);

  useEffect(() => {
    const el = new Audio();
    el.setAttribute("playsinline", "true");
    el.crossOrigin = "anonymous";
    audioRef.current = el;
    return () => {
      el.pause();
      el.src = "";
    };
  }, []);

  const showToast = (msg, timeout = 2500) => {
    setToast(msg);
    setTimeout(() => setToast(""), timeout);
  };

  const stopAll = () => {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    } catch {}
  };

  useEffect(() => {
    if (!reply?.voice_url) return;
    const play = async () => {
      const url = `${API_BASE}${reply.voice_url}`;
      stopAll();
      try {
        const a = audioRef.current;
        a.src = url;
        await a.play();
      } catch {}
    };
    setTimeout(play, 400);
  }, [reply]);

  const handleStop = async (blob) => {
    if (!blob) return;
    setLoading(true);
    stopAll();
    showToast("📤 Sending your voice...");
    try {
      const f = new FormData();
      f.append("user_id", "usr001");
      f.append("file", blob, "intent.wav");
      const res = await fetch(`${API_BASE}/intent/voice_intent`, { method: "POST", body: f });
      const data = await res.json();
      setReply(data);
      showToast("✅ BankAI replied");
    } catch {
      setError("⚠️ Server error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-blue-50 via-teal-50 to-white px-4 text-center relative">
      <button onClick={onBack} className="absolute top-5 left-5 bg-blue-100 text-blue-700 px-3 py-1 rounded-lg shadow-sm">
        ← Back
      </button>
      <h1 className="text-3xl font-bold text-blue-700 mb-2">🤖 BankAI — Intelligent Assistant</h1>
      <p className="text-gray-600 italic mb-10">“Танд юугаар туслах вэ?”</p>

      <Recorder onStop={handleStop} />

      {loading && (
        <div className="mt-10 flex flex-col items-center">
          <div className="amp-wrap">
            <div className="amp-bars" aria-hidden>
              <span /><span /><span /><span /><span />
            </div>
            <div className="amp-label text-blue-700">Банк хариулж байна…</div>
          </div>
        </div>
      )}

      {reply && !loading && (
        <div className="mt-10 bg-white p-6 rounded-2xl shadow-xl max-w-md w-full animate-fade-in">
          <p className="text-blue-900 text-xl font-semibold whitespace-pre-line">{reply.reply_text}</p>
        </div>
      )}
      {error && <p className="text-red-600 mt-6">{error}</p>}
      {toast && <p className="text-blue-700 mt-6">{toast}</p>}
    </div>
  );
}

// ====================================================
// 💬 Text Chatbot — Dynamic Intents + Typing + Fade
// ====================================================
function TextChat({ onBack }) {
  const [messages, setMessages] = useState([]);
  const [intents, setIntents] = useState([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    fetch(`${API_BASE}/intent/list_intents`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.intents)) {
          setIntents(d.intents.map((i) => i.display || i.name));
        }
      })
      .catch(() => setIntents([]));
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const sendMessage = async (msgText) => {
    const text = msgText || input;
    if (!text.trim()) return;
    const userMsg = { role: "user", text };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setTyping(true);
    try {
      const res = await fetch(`${API_BASE}/intent/text_intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      setTyping(false);
      setMessages((m) => [...m, { role: "bot", text: data.reply_text || "🤖 Алдаа гарлаа." }]);
    } catch {
      setTyping(false);
      setMessages((m) => [...m, { role: "bot", text: "⚠️ Сервертэй холбогдоогүй." }]);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-blue-50 via-teal-50 to-white text-center px-4 relative">
      <button onClick={onBack} className="absolute top-5 left-5 bg-blue-100 text-blue-700 px-3 py-1 rounded-lg shadow-sm">
        ← Back
      </button>
      <h1 className="text-3xl font-bold text-blue-700 mt-8 mb-2">💬 BankAI Chatbot</h1>
      <p className="text-gray-600 mb-6 italic">Ямар үйлчилгээг сонирхож байна?</p>

      <div className="flex flex-wrap justify-center gap-3 mb-6 px-2">
        {intents.map((name, i) => (
          <button
            key={i}
            onClick={() => sendMessage(name)}
            className="bg-gradient-to-r from-teal-500 to-blue-600 hover:from-blue-500 hover:to-teal-600 text-white font-semibold px-5 py-2 rounded-full shadow-md hover:shadow-lg transition-all duration-300 animate-glow"
          >
            {name}
          </button>
        ))}
      </div>

      {/* ✅ scrollable chat box */}
      <div
        className="flex-1 overflow-y-auto w-full max-w-md mx-auto bg-white rounded-2xl shadow-inner p-4 mb-4"
        style={{ maxHeight: "60vh" }}
      >
        {messages.map((m, i) => (
          <div
            key={i}
            className={`text-left mb-3 ${m.role === "user" ? "text-blue-700" : "text-teal-700"} animate-fade-in`}
          >
            <strong>{m.role === "user" ? "👤 Та:" : "🤖 BankAI:"}</strong> {m.text}
          </div>
        ))}
        {typing && (
          <div className="text-teal-600 text-left flex items-center gap-1 mb-2 animate-fade-in">
            <strong>🤖 BankAI:</strong>
            <span className="dot-flash"></span>
            <span className="dot-flash delay-200"></span>
            <span className="dot-flash delay-400"></span>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="mt-auto flex gap-2 justify-center mb-6">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          className="border rounded-lg px-3 py-2 w-2/3 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
          placeholder="Мессеж бичих..."
        />
        <button onClick={() => sendMessage()} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-md">
          Send
        </button>
      </div>

      <style>{`
        @keyframes glowPulse {
          0% { box-shadow: 0 0 8px rgba(0, 200, 255, 0.4); }
          50% { box-shadow: 0 0 16px rgba(0, 200, 255, 0.8); }
          100% { box-shadow: 0 0 8px rgba(0, 200, 255, 0.4); }
        }
        .animate-glow:hover { animation: glowPulse 1.5s infinite ease-in-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px);} to { opacity: 1; transform: translateY(0);} }
        .animate-fade-in { animation: fadeIn 0.4s ease-in-out; }
        @keyframes dotFlash { 0%,80%,100%{opacity:0.2;transform:scale(0.9);}40%{opacity:1;transform:scale(1);} }
        .dot-flash { width:6px;height:6px;background:teal;border-radius:50%;animation:dotFlash 1.4s infinite ease-in-out both; }
        .delay-200{animation-delay:0.2s;} .delay-400{animation-delay:0.4s;}
      `}</style>
    </div>
  );
}

// ====================================================
// 🏠 App Controller
// ====================================================
export default function App() {
  const [screen, setScreen] = useState("menu");
  if (screen === "voice") return <VoiceChat onBack={() => setScreen("menu")} />;
  if (screen === "text") return <TextChat onBack={() => setScreen("menu")} />;

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-b from-blue-50 via-teal-50 to-white text-center px-4">
      <h1 className="text-4xl font-bold text-blue-700 mb-4">🏦 BankAI Assistant</h1>
      <p className="text-gray-600 mb-10 italic">Your personal banking assistant</p>
      <button onClick={() => setScreen("voice")} className="bg-teal-600 hover:bg-teal-700 text-white font-semibold px-6 py-3 rounded-xl mb-4 shadow-md">
        🎙 Voice Chat
      </button>
      <button onClick={() => setScreen("text")} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl shadow-md">
        💬 Text Chatbot
      </button>
    </div>
  );
}

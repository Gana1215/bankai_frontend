// src/App.jsx ✅ FINAL (Worker removed, WebGPU hook kept, StatusPanel unchanged)
// NOTE: This file assumes your hook returns:
// { ready, busy, statusText, progress, transcribe }

import React, { useState, useEffect, useRef } from "react";
import Recorder from "./components/Recorder";
import { API_BASE } from "./utils/api";
import useOnnxTranscriber from "./hooks/useOnnxTranscriber";
import "./components/amplitude.css";

const TRANS_MODE = import.meta.env.VITE_TRANS_MODE || "1";
// "1" = backend (default), "0" = ONNX frontend

// ====================================================
// Helpers
// ====================================================
function makeAbs(url) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return `${API_BASE}${url}`;
}

function safeCreateAudio() {
  const a = new Audio();
  a.setAttribute("playsinline", "true");
  a.crossOrigin = "anonymous";
  return a;
}

// ====================================================
function StatusPanel({ ready, busy, statusText, progress }) {
  const pct = Math.max(0, Math.min(100, progress?.pct ?? 0));
  const file = progress?.file ?? "";

  const pill = ready
    ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
    : "bg-blue-500/15 text-blue-700 border-blue-500/30";

  const dot = ready ? "bg-emerald-500" : "bg-blue-500";

  return (
    <div className="w-full max-w-md bg-white/70 border border-blue-100 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2.5 h-2.5 rounded-full ${dot} ${busy ? "animate-pulse" : ""}`} />
          <div className="text-[11px] font-mono uppercase tracking-widest text-gray-700 truncate">
            {statusText || (ready ? "Ready" : "Loading…")}
          </div>
        </div>

        <span className={`text-[10px] font-mono uppercase px-2 py-1 rounded-full border ${pill}`}>
          {ready ? (busy ? "Busy" : "Ready") : "Loading"}
        </span>
      </div>

      {!ready && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] font-mono text-gray-500">
            <span className="truncate max-w-[75%]">{file ? file : "Loading assets…"}</span>
            <span>{pct > 0 ? `${pct}%` : "…"}</span>
          </div>

          <div className="mt-2 h-2 rounded-full bg-gray-200 overflow-hidden">
            {pct > 0 ? (
              <div className="h-full bg-blue-600/80" style={{ width: `${pct}%` }} />
            ) : (
              <div className="h-full w-1/3 bg-blue-600/80 animate-pulse" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ====================================================
// 🎙 VoiceChat
// ====================================================
function VoiceChat({ onBack }) {
  const [reply, setReply] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [useTestWav, setUseTestWav] = useState(false);

  // DEMO PATCH — backend timing panel
  const [demo, setDemo] = useState(null);

  const audioRef = useRef(null);
  const { ready, busy, statusText, progress, transcribe } = useOnnxTranscriber();

  useEffect(() => {
    audioRef.current = safeCreateAudio();
  }, []);

  const showToast = (msg, ms = 2300) => {
    setToast(msg);
    setTimeout(() => setToast(""), ms);
  };

  const stopPlayback = () => {
    try {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    } catch {}
  };

  useEffect(() => {
    if (!reply?.voice_url) return;
    setTimeout(async () => {
      try {
        stopPlayback();
        audioRef.current.src = makeAbs(reply.voice_url);
        await audioRef.current.play();
      } catch {}
    }, 400);
  }, [reply]);

  // ====================================================
  const handleStop = async (blob) => {
    if (!blob) return;

    if (useTestWav) {
      showToast("🧪 Using /test.wav...");
      try {
        const r = await fetch("/test.wav");
        const arr = await r.arrayBuffer();
        const type = r.headers.get("content-type")?.split(";")[0] || "audio/wav";
        blob = new Blob([arr], { type });
      } catch {
        showToast("⚠️ test.wav error");
        return;
      }
    }

    stopPlayback();
    setLoading(true);
    setDemo(null);

    try {
      if (TRANS_MODE === "0") {
        // Local mode unchanged
        if (!ready) {
          const t0 = Date.now();
          while (!ready && Date.now() - t0 < 12000) {
            await new Promise((r) => setTimeout(r, 250));
          }
          if (!ready) {
            showToast("⚠️ Модель амжаагүй.");
            setLoading(false);
            return;
          }
        }
        showToast("🎧 Local...");
        const text = await transcribe(blob);
        if (!text?.trim()) {
          showToast("⚠️ Танигдсангүй");
          setLoading(false);
          return;
        }
        const res = await fetch(`${API_BASE}/intent/text_intent`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        setReply(await res.json());
        showToast("🤖 BankAI хариуллаа!");
      } else {
        // Backend mode — PATCH HERE
        showToast("📤 Server...");
        const f = new FormData();
        f.append("user_id", "usr001");
        f.append("file", blob, "voice.wav");

        const res = await fetch(`${API_BASE}/intent/voice_intent`, {
          method: "POST",
          body: f,
        });

        const data = await res.json();
        setReply(data);

        // DEMO PATCH: safe defaults
        setDemo({
          user_text: data.user_text ?? "",
          stt_ms: data.stt_ms ?? 0,
          processing_ms: data.processing_ms ?? 0,
          total_ms: data.total_ms ?? 0,
        });

        showToast("🤖 BankAI!");
      }
    } catch (err) {
      console.error(err);
      setError("⚠️ Сервер алдаа");
    } finally {
      setLoading(false);
    }
  };

  const fmtS = (ms) => (typeof ms === "number" ? `${(ms / 1000).toFixed(2)}s` : "—");

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-blue-50 via-teal-50 to-white px-4 text-center relative">
      <button
        onClick={onBack}
        className="absolute top-5 left-5 bg-blue-100 text-blue-700 px-3 py-1 rounded-lg shadow-sm"
      >
        ← Back
      </button>

      <h1 className="text-3xl font-bold text-blue-700 mb-2">🤖 BankAI — Voice Assistant</h1>

      {TRANS_MODE === "0" && (
        <div className="mb-6">
          <StatusPanel ready={ready} busy={busy} statusText={statusText} progress={progress} />
        </div>
      )}

      <Recorder onStop={handleStop} />

      <button
        onClick={() => setUseTestWav((v) => !v)}
        className={`mt-4 px-4 py-2 rounded-lg shadow ${
          useTestWav ? "bg-purple-700 text-white" : "bg-purple-100 text-purple-700"
        }`}
      >
        🧪 Test WAV: {useTestWav ? "ON" : "OFF"}
      </button>

      {loading && (
        <div className="mt-8 text-blue-700">
          <div className="amp-bars"></div>
          <p>{TRANS_MODE === "0" ? (busy ? "Transcribing..." : "Processing...") : "Processing..."}</p>
        </div>
      )}

      {/* DEMO PANEL — PATCH: show when demo exists, not only when user_text */}
      {TRANS_MODE !== "0" && demo && !loading && (
        <div className="mt-6 bg-white/80 p-4 rounded-2xl shadow max-w-md w-full text-left border border-blue-100">
          <div className="text-[11px] font-mono text-gray-700 whitespace-pre-line">
            🎙️ Transcription: {fmtS(demo.stt_ms)} | 🤖 Intent + Reply: {fmtS(demo.processing_ms)} | ⏳ Total:{" "}
            {fmtS(demo.total_ms)}
          </div>
          <div className="mt-2 text-[12px] font-mono text-blue-900 whitespace-pre-line">
            📝 Text: “{demo.user_text || "—"}”
          </div>
        </div>
      )}

      {reply && !loading && (
        <div className="mt-8 bg-white p-5 rounded-2xl shadow-lg max-w-md w-full animate-fade-in">
          <p className="text-blue-900 text-lg font-semibold whitespace-pre-line">{reply.reply_text}</p>
        </div>
      )}

      {toast && <p className="text-blue-700 mt-4">{toast}</p>}
      {error && <p className="text-red-600 mt-4">{error}</p>}
    </div>
  );
}

// ====================================================
function TextChat({ onBack }) {
  const [messages, setMessages] = useState([]);
  const [intents, setIntents] = useState([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const chatEndRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    audioRef.current = safeCreateAudio();
  }, []);

  const stopPlayback = () => {
    try {
      const a = audioRef.current;
      a.pause();
      a.currentTime = 0;
    } catch {}
  };

  const playVoice = async (voice_url) => {
    const a = audioRef.current;
    const url = makeAbs(voice_url);
    if (!a || !url) return;
    try {
      stopPlayback();
      a.src = url;
      await a.play();
    } catch {}
  };

  useEffect(() => {
    fetch(`${API_BASE}/intent/list_intents`)
      .then((r) => r.json())
      .then((d) => Array.isArray(d.intents) && setIntents(d.intents.map((i) => i.display || i.name)))
      .catch(() => setIntents([]));
  }, []);

  const sendMessage = async (msg) => {
    const text = msg || input;
    if (!text.trim()) return;

    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setTyping(true);

    try {
      const res = await fetch(`${API_BASE}/intent/text_intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      const data = await res.json();

      setMessages((m) => [
        ...m,
        { role: "bot", text: data.reply_text, voice_url: data.voice_url || null },
      ]);

      if (data.voice_url) await playVoice(data.voice_url);
    } catch {
      setMessages((m) => [...m, { role: "bot", text: "⚠️ Сервертэй холбогдох боломжгүй." }]);
    }

    setTyping(false);
  };

  useEffect(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), [messages, typing]);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-blue-50 via-teal-50 to-white text-center px-4 relative">
      <button
        onClick={onBack}
        className="absolute top-5 left-5 bg-blue-100 text-blue-700 px-3 py-1 rounded-lg shadow-sm"
      >
        ← Back
      </button>

      <h1 className="text-3xl font-bold text-blue-700 mt-8 mb-2">💬 BankAI Chatbot</h1>

      <div className="flex-1 overflow-y-auto w-full max-w-md mx-auto bg-white rounded-2xl shadow-inner p-4 mb-4 mt-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`mb-2 text-left ${m.role === "user" ? "text-blue-700" : "text-teal-700"}`}
          >
            <strong>{m.role === "user" ? "👤 Та:" : "🤖 BankAI:"}</strong>{" "}
            {m.text}

            {m.role === "bot" && m.voice_url && (
              <button
                onClick={() => playVoice(m.voice_url)}
                className="ml-2 text-[12px] px-2 py-1 rounded bg-teal-100 text-teal-700"
                title="Play voice reply"
              >
                🔊 Play
              </button>
            )}
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      <div className="flex gap-2 justify-center mb-6">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          className="border rounded-lg px-3 py-2 w-2/3 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
          placeholder="Мессеж бичих..."
        />
        <button
          onClick={() => sendMessage()}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
        >
          Send
        </button>
      </div>
    </div>
  );
}

// ====================================================
export default function App() {
  const [screen, setScreen] = useState("menu");
  if (screen === "voice") return <VoiceChat onBack={() => setScreen("menu")} />;
  if (screen === "text") return <TextChat onBack={() => setScreen("menu")} />;

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-b from-blue-50 via-teal-50 to-white text-center px-4">
      <h1 className="text-4xl font-bold text-blue-700 mb-2">🏦 BankAI Assistant</h1>
      <p className="text-gray-600 mb-8 italic">
        Mode: {TRANS_MODE === "0" ? "🧠 Local ONNX (WebGPU)" : "☁️ Server STT"}
      </p>

      <button
        onClick={() => setScreen("voice")}
        className="bg-teal-600 hover:bg-teal-700 text-white font-semibold px-6 py-3 rounded-xl mb-4 shadow-md"
      >
        🎙 Voice Chat
      </button>
      <button
        onClick={() => setScreen("text")}
        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl shadow-md"
      >
        💬 Text Chatbot
      </button>
    </div>
  );
}

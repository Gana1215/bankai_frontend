// src/App.jsx — FINAL LOCKED VERSION (SHOW_TIMING + Local/Backend Timing Panels)
// (Backend timing moved under toggle + Local timing panel removed + scrollable TextChat)

import React, { useState, useEffect, useRef } from "react";
import Recorder from "./components/Recorder";
import { API_BASE } from "./utils/api";
import useOnnxTranscriber from "./hooks/useOnnxTranscriber";
import "./components/amplitude.css";

const TRANS_MODE_DEFAULT = import.meta.env.VITE_TRANS_MODE || "1";
const SHOW_TIMING = String(import.meta.env.VITE_SHOW_TIMING || "0") === "1"; // ⭐ safer

// ====================================================
// Status Panel (Front-end ONNX)
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
            <span className="truncate max-w-[75%]">{file || "Loading assets…"}</span>
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

      {ready && (
        <div className="mt-3 text-[10px] font-mono text-gray-500">
          Mode: <span className="text-gray-800">Front Model</span>
          <span className="mx-2 text-gray-300">|</span>
          State: <span className="text-gray-800">Ready</span>
        </div>
      )}
    </div>
  );
}

// ====================================================
// VoiceChat (Front + Backend STT)
// ====================================================
function VoiceChat({ onBack }) {
  const [reply, setReply] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  // transcript + RTF (local)
  const [lastTranscript, setLastTranscript] = useState("");
  const [lastPerf, setLastPerf] = useState({
    audioSec: null,
    inferMs: null,
    rtf: null,
    speedX: null,
  });

  // backend (server timing panel)
  const [backendDemo, setBackendDemo] = useState(null);

  const initialMode =
    localStorage.getItem("sttMode") || (TRANS_MODE_DEFAULT === "0" ? "local" : "backend");

  const [sttMode, setSttMode] = useState(initialMode);

  const audioRef = useRef(null);
  const wavInputRef = useRef(null);

  const { ready, busy, statusText, progress, transcribe } = useOnnxTranscriber();

  useEffect(() => {
    localStorage.setItem("sttMode", sttMode);
  }, [sttMode]);

  useEffect(() => {
    const audio = new Audio();
    audio.setAttribute("playsinline", "true");
    audio.crossOrigin = "anonymous";
    audioRef.current = audio;
  }, []);

  const stopPlayback = () => {
    try {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    } catch {}
  };

  const showToast = (msg, ms = 2300) => {
    setToast(msg);
    setTimeout(() => setToast(""), ms);
  };

  useEffect(() => {
    if (!reply?.voice_url) return;
    setTimeout(async () => {
      try {
        stopPlayback();
        audioRef.current.src = `${API_BASE}${reply.voice_url}`;
        await audioRef.current.play();
      } catch {}
    }, 400);
  }, [reply]);

  // Local mode audio duration decode
  async function getAudioDurationSec(blob) {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000,
      });
      const arr = await blob.arrayBuffer();
      const decoded = await audioCtx.decodeAudioData(arr);
      const sec = decoded?.duration ?? null;
      try {
        await audioCtx.close();
      } catch {}
      return sec;
    } catch {
      return null;
    }
  }

  const handleStop = async (blob) => {
    if (!blob) return;

    stopPlayback();
    setReply(null);
    setBackendDemo(null);
    setLastTranscript("");
    setLastPerf({ audioSec: null, inferMs: null, rtf: null, speedX: null });
    setError("");
    setLoading(true);

    try {
      // =======================
      // LOCAL MODE (WebGPU)
      // =======================
      if (sttMode === "local") {
        if (!ready) {
          showToast("⏳ Модель ачаалж байна...");
          const t0 = Date.now();
          while (!ready && Date.now() - t0 < 12000) await new Promise((r) => setTimeout(r, 200));
          if (!ready) {
            showToast("⚠️ Model not ready");
            setLoading(false);
            return;
          }
        }

        showToast("🎧 Converting locally...");

        const audioSec = await getAudioDurationSec(blob);
        const tInfer0 = performance.now();
        const text = await transcribe(blob);
        const inferMs = Math.round(performance.now() - tInfer0);

        const rtf = audioSec ? inferMs / 1000 / audioSec : null;
        const speedX = rtf ? 1 / rtf : null;

        setLastTranscript(text || "");
        setLastPerf({ audioSec, inferMs, rtf, speedX });

        if (!text?.trim()) {
          showToast("⚠️ Could not transcribe");
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
      }

      // =======================
      // BACKEND MODE
      // =======================
      else {
        showToast("📤 Илгээж байна…");

        const f = new FormData();
        f.append("user_id", "usr001");
        f.append("file", blob, "voice.wav");

        const res = await fetch(`${API_BASE}/intent/voice_intent`, { method: "POST", body: f });
        const data = await res.json();
        setReply(data);

        setBackendDemo({
          user_text: data.user_text || "",
          stt_ms: data.stt_ms ?? null,
          processing_ms: data.processing_ms ?? null,
          total_ms: data.total_ms ?? null,
        });

        showToast("🤖 BankAI хариуллаа!");
      }
    } catch (err) {
      console.error(err);
      setError("⚠️ Алдаа гарлаа");
    } finally {
      setLoading(false);
    }
  };

  const handleBrowseFile = async (e) => {
    const file = e.target.files?.[0];
    if (file) await handleStop(file);
    e.target.value = "";
  };

  const fmt = (ms) => (typeof ms === "number" ? (ms / 1000).toFixed(2) + "s" : "—");

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-blue-50 via-teal-50 to-white px-4 text-center relative">
      <button
        onClick={onBack}
        className="absolute top-5 left-5 bg-blue-100 text-blue-700 px-3 py-1 rounded-lg shadow-sm"
      >
        ← Back
      </button>

      <h1 className="text-3xl font-bold text-blue-700 mb-2">🤖 BankAI — Voice Assistant</h1>

      {/* MODE TOGGLE */}
      <div className="flex flex-col items-center gap-2 mb-4">
        <div className="text-[11px] font-mono uppercase tracking-widest text-gray-600">Model Mode</div>

        <button
          onClick={() => setSttMode((m) => (m === "local" ? "backend" : "local"))}
          className={`relative w-[280px] h-[48px] rounded-2xl border shadow-md transition-all active:scale-[0.99]
            ${
              sttMode === "local"
                ? "bg-emerald-600/90 border-emerald-700/30"
                : "bg-blue-600/90 border-blue-700/30"
            }`}
        >
          <div className="absolute inset-0 flex items-center justify-between px-4 text-[11px] font-mono uppercase tracking-widest text-white/90">
            <span>Front</span>
            <span>Back</span>
          </div>

          <div
            className={`absolute top-[6px] w-[128px] h-[36px] rounded-xl bg-white/95 shadow-lg transition-all
              ${sttMode === "local" ? "left-[6px]" : "left-[146px]"}`}
          >
            <div className="h-full w-full flex items-center justify-center">
              <span className="text-[11px] font-mono uppercase tracking-widest text-gray-800">
                {sttMode === "local" ? "ON" : "OFF"}
              </span>
            </div>
          </div>
        </button>

        {sttMode === "local" && (
          <div className="mb-4">
            <StatusPanel ready={ready} busy={busy} statusText={statusText} progress={progress} />
          </div>
        )}
      </div>

      {/* ================================================= */}
      {/* ⭐ BACKEND TIMING PANEL (MOVED: under toggle)      */}
      {/* ================================================= */}
      {SHOW_TIMING && sttMode === "backend" && backendDemo && !loading && (
        <div className="w-full max-w-md bg-white/80 border border-blue-100 rounded-2xl p-4 shadow-sm mb-4 text-left">
          <div className="text-[11px] font-mono text-gray-700 whitespace-pre-line">
            🎙️ Transcription: {fmt(backendDemo.stt_ms)} | 🤖 Intent + Reply:{" "}
            {fmt(backendDemo.processing_ms)} | ⏳ Total: {fmt(backendDemo.total_ms)}
          </div>

          <div className="mt-2 text-[12px] font-mono text-blue-900 whitespace-pre-line">
            📝 Text: “{backendDemo.user_text || "—"}”
          </div>

          {(backendDemo.stt_ms == null || backendDemo.total_ms == null) && (
            <div className="mt-2 text-[11px] font-mono text-amber-700">
              ⚠️ Backend timing fields are missing. Patch backend /voice_intent to return user_text/stt_ms/processing_ms/total_ms.
            </div>
          )}
        </div>
      )}

      {/* ================================================= */}
      {/* TRANSCRIPT BOX (shown for both local and backend) */}
      {/* ================================================= */}
      {(sttMode === "local" || lastTranscript) && (
        <div className="w-full max-w-md bg-white/70 border border-gray-200 rounded-2xl p-4 shadow-sm mb-6 text-left">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-mono uppercase tracking-widest text-gray-700">Transcript</div>

            {/* Local metadata (unchanged) */}
            <div className="text-[10px] font-mono text-gray-500">
              {lastPerf.inferMs != null ? `${lastPerf.inferMs}ms` : ""}
              {lastPerf.audioSec != null ? ` • ${lastPerf.audioSec.toFixed(2)}s` : ""}
              {lastPerf.rtf != null ? ` • RTF ${lastPerf.rtf.toFixed(2)}` : ""}
              {lastPerf.speedX != null ? ` • x${lastPerf.speedX.toFixed(2)}` : ""}
            </div>
          </div>

          <div className="mt-2 whitespace-pre-wrap text-gray-800 text-[14px] leading-relaxed min-h-[44px]">
            {lastTranscript ? lastTranscript : loading ? "…" : "—"}
          </div>
        </div>
      )}

      <Recorder onStop={handleStop} />

      {/* FILE BROWSER */}
      <div className="mt-4 w-full max-w-md">
        <div className="relative bg-white/70 hover:bg-white border border-blue-100 py-3 rounded-xl shadow-sm transition-all flex items-center justify-center cursor-pointer overflow-hidden">
          <input
            ref={wavInputRef}
            type="file"
            accept="audio/*"
            onChange={handleBrowseFile}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
          <span className="text-[12px] font-mono uppercase tracking-widest text-blue-700">
            📁 Browse WAV/MP3 (Demo)
          </span>
        </div>
      </div>

      {loading && (
        <div className="mt-8 text-blue-700">
          <div className="amp-bars"></div>
          <p>{sttMode === "local" ? (busy ? "Transcribing..." : "Processing...") : "Processing..."}</p>
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
// TEXT CHAT — SCROLLABLE + intent buttons
// ====================================================
function TextChat({ onBack }) {
  const [messages, setMessages] = useState([]);
  const [intents, setIntents] = useState([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const chatEndRef = useRef(null);

  const titleCase = (s) =>
    String(s || "")
      .replace(/_/g, " ")
      .replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());

  useEffect(() => {
    fetch(`${API_BASE}/intent/list_intents`)
      .then((r) => r.json())
      .then((d) => {
        if (!Array.isArray(d.intents)) return;
        setIntents(
          d.intents.map((i) => ({
            name: i.name,
            display: i.display_mn || i.display || i.title || i.display_name || titleCase(i.name),
          }))
        );
      })
      .catch(() => setIntents([]));
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const sendIntentKey = async (key, displayText) => {
    setMessages((m) => [...m, { role: "user", text: displayText }]);
    setTyping(true);

    try {
      const res = await fetch(`${API_BASE}/intent/text_intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // ✅ LOCKED: use direct_click for direct intent buttons
        body: JSON.stringify({ intent: key, source: "direct_click" }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: "bot", text: data.reply_text }]);
    } catch {
      setMessages((m) => [...m, { role: "bot", text: "⚠️ Сервертэй холбогдох алдаа." }]);
    }

    setTyping(false);
  };

  const sendMessage = async () => {
    if (!input.trim()) return;

    const text = input;
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
      setMessages((m) => [...m, { role: "bot", text: data.reply_text }]);
    } catch {
      setMessages((m) => [...m, { role: "bot", text: "⚠️ Сервертэй холбогдох боломжгүй." }]);
    }

    setTyping(false);
  };

  return (
    // ✅ scroll fix: min-h-0 allows flex children to shrink + overflow scroll to work
    <div className="h-screen flex flex-col min-h-0 bg-gradient-to-b from-blue-50 via-teal-50 to-white text-center px-4 relative overflow-hidden">

      <button
        onClick={onBack}
        className="absolute top-5 left-5 bg-blue-100 text-blue-700 px-3 py-1 rounded-lg shadow-sm"
      >
        ← Back
      </button>

      <h1 className="text-3xl font-bold text-blue-700 mt-8 mb-2">💬 BankAI Chatbot</h1>

      {/* Intent buttons */}
      {intents.length > 0 && (
        <div className="flex flex-wrap justify-center gap-3 mb-6 px-1 mt-4">
          {intents.map((i) => (
            <button
              key={i.name}
              onClick={() => sendIntentKey(i.name, i.display)}
              className="bg-gradient-to-r from-teal-500 to-blue-600 hover:from-blue-500 hover:to-teal-600 text-white font-semibold px-4 py-2 rounded-full shadow-md hover:shadow-lg transition-all text-[12px]"
            >
              {i.display}
            </button>
          ))}
        </div>
      )}

      {/* Scrollable Chat Window */}
      <div className="flex-1 min-h-0 overflow-y-auto w-full max-w-md mx-auto bg-white rounded-2xl shadow-inner p-4 mb-4 mt-2">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`mb-2 text-left ${m.role === "user" ? "text-blue-700" : "text-teal-700"}`}
          >
            <strong>{m.role === "user" ? "👤 Та:" : "🤖 BankAI:"}</strong> {m.text}
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 justify-center mb-6">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          className="border rounded-lg px-3 py-2 w-2/3 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
          placeholder="Мессэж бичих..."
        />
        <button onClick={sendMessage} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg">
          Send
        </button>
      </div>
    </div>
  );
}

// ====================================================
// App Controller
// ====================================================
export default function App() {
  const [screen, setScreen] = useState("menu");

  if (screen === "voice") return <VoiceChat onBack={() => setScreen("menu")} />;
  if (screen === "text") return <TextChat onBack={() => setScreen("menu")} />;

  const defaultLabel = TRANS_MODE_DEFAULT === "0" ? "Front Model mode" : "Back Model mode";

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-b from-blue-50 via-teal-50 to-white text-center px-4">
      <h1 className="text-4xl font-bold text-blue-700 mb-2">🏦 BankAI Assistant</h1>
      <p className="text-gray-600 mb-8 italic">Default: {defaultLabel}</p>

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

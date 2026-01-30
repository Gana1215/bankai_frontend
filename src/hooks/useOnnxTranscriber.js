// src/hooks/useOnnxTranscriber.jsx
// ===============================================
// 🧠 useOnnxTranscriber — FINAL GOLDEN MOBILE PATCH
// -----------------------------------------------
// ✅ Fixes mobile/web transcription mismatch by forcing true 16k mono PCM
// ✅ Mobile-safe WASM config (no fake threads; no proxy-worker surprises)
// ✅ Keeps your existing API + UI states intact
// ✅ Removes dtype="q8" to avoid dtype/model_file_names conflicts
// ✅ Adds lightweight audio stats logging (DEBUG only)
// ===============================================

import { useCallback, useEffect, useRef, useState } from "react";
import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3";

const DEBUG_ASR = true;
const dbg = (...a) => DEBUG_ASR && console.log(...a);
const dbe = (...a) => DEBUG_ASR && console.error(...a);

const MODEL_ID = import.meta.env.VITE_HF_MODEL_ID || "gana1215/WASM_int8";

// -----------------------------
// Helpers: audio diagnostics
// -----------------------------
function audioStats(f32) {
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < f32.length; i++) {
    const v = f32[i];
    const a = Math.abs(v);
    if (a > peak) peak = a;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / Math.max(1, f32.length));
  return { peak: +peak.toFixed(4), rms: +rms.toFixed(4), len: f32.length };
}

// -----------------------------
// Helpers: decode + resample to 16k mono
// (Mobile-safe: do NOT trust AudioContext sampleRate parameter)
// -----------------------------
async function decodeTo16kMono(blobOrFile) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx(); // do NOT force sampleRate here (mobile may ignore)
  try {
    const ab = await blobOrFile.arrayBuffer();
    const decoded = await ctx.decodeAudioData(ab);

    // Mixdown to mono (if needed)
    const ch0 = decoded.getChannelData(0);
    let mono = ch0;
    if (decoded.numberOfChannels > 1) {
      const ch1 = decoded.getChannelData(1);
      mono = new Float32Array(ch0.length);
      for (let i = 0; i < mono.length; i++) mono[i] = 0.5 * (ch0[i] + ch1[i]);
    }

    // If already 16k, return mono directly
    if (decoded.sampleRate === 16000) {
      return mono;
    }

    // Resample to 16k using OfflineAudioContext (frame count must be integer)
    const srcBuf = ctx.createBuffer(1, mono.length, decoded.sampleRate);
    srcBuf.copyToChannel(mono, 0);

    const targetLen = Math.ceil(srcBuf.duration * 16000);
    const offline = new OfflineAudioContext(1, targetLen, 16000);

    const src = offline.createBufferSource();
    src.buffer = srcBuf;
    src.connect(offline.destination);
    src.start(0);

    const rendered = await offline.startRendering();
    return rendered.getChannelData(0);
  } finally {
    try {
      await ctx.close();
    } catch {
      // ignore close errors on some mobile browsers
    }
  }
}

export default function useOnnxTranscriber() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState("Standby");
  const [progress, setProgress] = useState({ pct: 0, file: "" });

  const transcriberRef = useRef(null);
  const loadingPromiseRef = useRef(null);

  useEffect(() => {
    // --- 1) MODEL FETCH CONFIG ---
    env.allowRemoteModels = true;
    env.allowLocalModels = false;

    // --- 2) GOLDEN WASM CONFIG (mobile-safe) ---
    const wasm = env.backends?.onnx?.wasm;
    if (wasm && typeof window !== "undefined") {
      wasm.wasmPaths = window.location.origin + "/ort/";

      // 🔒 Golden mobile-safe settings:
      // - Threads >1 require COOP/COEP (crossOriginIsolated). Without it you get fallback + overhead.
      // - proxy=true can add overhead / scheduling weirdness on some mobiles.
      wasm.numThreads = 1;
      wasm.proxy = false;
      wasm.simd = true;
    }

    dbg("🧠 [HOOK] Booted: GOLDEN WASM Mode (mobile-safe)");
  }, []);

  const load = useCallback(async () => {
    if (transcriberRef.current) return transcriberRef.current;
    if (loadingPromiseRef.current) return loadingPromiseRef.current;

    setBusy(true);
    setStatusText("🔄 Loading Neural Engine...");

    loadingPromiseRef.current = (async () => {
      try {
        const t0 = performance.now();

        const transcriber = await pipeline("automatic-speech-recognition", MODEL_ID, {
          device: "wasm", // HARD-LOCKED to WASM for broadest compatibility

          // ✅ Removed dtype to avoid conflicts when we explicitly specify model_file_names.
          // Some setups behave better on mobile without dtype forcing.
          // dtype: "q8",

          model_file_names: {
            encoder_model: "encoder_model_quantized.onnx",
            decoder_model_merged: "decoder_model_merged_quantized.onnx",
          },

          progress_callback: (p) => {
            if (p.status === "progress") {
              const pct = Math.round(p.progress || 0);
              setProgress({ pct, file: p.file || "" });
              setStatusText(`⏳ Loading… ${pct}%`);
            }
          },
        });

        transcriberRef.current = transcriber;
        setReady(true);
        setBusy(false);
        setStatusText(`✅ Ready • ${Math.round(performance.now() - t0)}ms`);
        return transcriber;
      } catch (err) {
        dbe("❌ [HOOK] Load failed:", err);
        setStatusText(`❌ Load error: ${err?.message || String(err)}`);
        setReady(false);
        setBusy(false);
        throw err;
      } finally {
        loadingPromiseRef.current = null;
      }
    })();

    return loadingPromiseRef.current;
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const transcribe = useCallback(async (blob) => {
    if (!blob || !transcriberRef.current) return null;

    setBusy(true);
    setStatusText("🎙️ Decoding…");

    try {
      // ✅ GOLDEN MOBILE FIX: decode + resample explicitly to 16k mono
      const audioData = await decodeTo16kMono(blob);

      if (DEBUG_ASR) {
        const st = audioStats(audioData);
        dbg("🎚️ [AUDIO] stats:", st, "sec@16k≈", (st.len / 16000).toFixed(2));
      }

      const result = await transcriberRef.current(audioData, {
        language: "mn",
        task: "transcribe",
        return_timestamps: false,

        // Keep decode fast & stable
        generate_kwargs: {
          num_beams: 1,
          do_sample: false,
          max_new_tokens: 256,
          language: "mn",
          task: "transcribe",
        },
      });

      setStatusText("✅ Done");
      return result?.text ?? "";
    } catch (err) {
      dbe("❌ Transcribe failed:", err);
      setStatusText("❌ Transcribe error");
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  return { ready, busy, statusText, progress, transcribe };
}

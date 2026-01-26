import { useCallback, useEffect, useRef, useState } from "react";
import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3";

const DEBUG_ASR = true;
const dbg = (...a) => DEBUG_ASR && console.log(...a);
const dbe = (...a) => DEBUG_ASR && console.error(...a);

// ✅ Local model folder lives in: /public/models/onnx_int8_wasm
const MODEL_ID = "models/onnx_int8_wasm";

// =========================
// Platform detection
// =========================
function isIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes("Mac") &&
      typeof document !== "undefined" &&
      "ontouchend" in document)
  );
}

function isAndroid() {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent || "");
}

function isMobile() {
  return isIOS() || isAndroid();
}

// ✅ INT8 Golden model: force WASM everywhere (matches your working HTML)
function pickDevice() {
  return "wasm"; // 🔒 INT8 PATCH
}

// =========================
// Helpers
// =========================
function fmtMs(ms) {
  if (!Number.isFinite(ms)) return "n/a";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

export default function useOnnxTranscriber() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState("Standby");
  const [progress, setProgress] = useState({ pct: 0, file: "" });

  const transcriberRef = useRef(null);
  const loadingPromiseRef = useRef(null);
  const deviceRef = useRef(pickDevice());

  // ✅ Rich telemetry (does NOT affect decoding)
  const metricsRef = useRef({
    runs: 0,
    lastLoadMs: null,
    lastDecodeMs: null,
    lastInferMs: null,
    lastTotalMs: null,
    lastAudioSec: null,
    lastRTF: null, // infer_sec / audio_sec (lower is faster)
    lastTextLen: null,
  });

  // ✅ PATCH-B: Track last progress tick so we can show “stalled …” messages
  const lastProgressRef = useRef({
    t: 0,
    pct: 0,
    file: "",
    raw: null,
  });

  useEffect(() => {
    env.allowRemoteModels = false;
    env.allowLocalModels = true;

    // ✅ IMPORTANT for Vite: public/models/... is served from "/models/..."
    env.localModelPath = "/";

    // ✅ ORT wasm assets under /public/ort (only needed for WASM backend)
    const wasm = env.backends?.onnx?.wasm;
    if (wasm && typeof window !== "undefined") {
      // ✅ MUST be a STRING base-path for Transformers.js
      const ORT_BASE = new URL("/ort/", window.location.href).toString();
      wasm.wasmPaths = ORT_BASE;

      // ✅ Mobile-safe memory settings
      const canThread =
        typeof crossOriginIsolated !== "undefined" && crossOriginIsolated;

      wasm.numThreads = isMobile()
        ? 1
        : canThread
          ? clamp((navigator.hardwareConcurrency || 4) - 1, 1, 4)
          : 1;

      // ✅ Keep stable: no proxy worker
      wasm.proxy = false;

      // (optional) ensure simd on, like your HTML (doesn't hurt)
      wasm.simd = true;
    }

    dbg("🧠 [HOOK] Boot.");
    dbg(
      "🧠 [HOOK] Platform:",
      isIOS() ? "iOS" : isAndroid() ? "Android" : "Desktop"
    );
    dbg(
      "🧠 [HOOK] WebGPU available:",
      typeof navigator !== "undefined" ? !!navigator.gpu : false
    );
    dbg("🧠 [HOOK] Device selected:", deviceRef.current);
    dbg("🧠 [HOOK] localModelPath=/");
    dbg("🧠 [HOOK] wasmPaths:", env.backends?.onnx?.wasm?.wasmPaths);
    dbg("🧠 [HOOK] wasm.numThreads:", env.backends?.onnx?.wasm?.numThreads);
    dbg(
      "🧠 [HOOK] crossOriginIsolated:",
      typeof crossOriginIsolated !== "undefined" ? crossOriginIsolated : null
    );

    if (typeof window !== "undefined") {
      window.__ASR__ = {
        get transcriber() {
          return transcriberRef.current;
        },
        get device() {
          return deviceRef.current;
        },
        get metrics() {
          return metricsRef.current;
        },
      };
    }
  }, []);

  const load = useCallback(async () => {
    if (transcriberRef.current) return transcriberRef.current;
    if (loadingPromiseRef.current) return loadingPromiseRef.current;

    setBusy(true);
    setReady(false);
    setStatusText(`🔄 Loading Neural Engine (${deviceRef.current})…`);
    setProgress({ pct: 0, file: "" });

    dbg("🚀 [HOOK] pipeline() init starting…");

    // ✅ PATCH-B: Stall detector
    const stallTimer = setInterval(() => {
      const last = lastProgressRef.current;
      if (!last?.t) return;
      const age = Date.now() - last.t;
      if (age > 6000) {
        const shortFile = last.file ? last.file.split("/").pop() : "";
        setStatusText(
          `⏳ Loading… stalled ${Math.round(age / 1000)}s${
            shortFile ? ` • ${shortFile}` : ""
          }`
        );
      }
    }, 1000);

    const progressCb = (p) => {
      if (!p) return;

      if (p.status === "progress") {
        const pct = clamp(Math.round(p.progress ?? 0), 0, 100);
        const file = p.file ?? "";
        const shortFile = file ? file.split("/").pop() : "";

        lastProgressRef.current = { t: Date.now(), pct, file, raw: p.progress };

        setProgress({ pct, file });
        setStatusText(`⏳ Loading… ${pct}%${shortFile ? ` • ${shortFile}` : ""}`);
        dbg(`[LOAD] ${pct}%`, file);
      } else {
        lastProgressRef.current = {
          t: Date.now(),
          pct: lastProgressRef.current.pct ?? 0,
          file: p.file ?? lastProgressRef.current.file ?? "",
          raw: null,
        };

        dbg("[LOAD]", p.status, p.file || "");
      }
    };

    loadingPromiseRef.current = (async () => {
      try {
        const t0 = performance.now();

        // 🔒 INT8 PATCH: match working HTML loader
        const transcriber = await pipeline("automatic-speech-recognition", MODEL_ID, {
          device: "wasm",
          dtype: "q8",
          local_files_only: true,
          model_file_names: {
            encoder_model: "encoder_model_quantized.onnx",
            decoder_model_merged: "decoder_model_merged_quantized.onnx",
          },
          progress_callback: progressCb,
        });

        transcriberRef.current = transcriber;

        const loadMs = Math.round(performance.now() - t0);
        metricsRef.current.lastLoadMs = loadMs;

        console.groupCollapsed(`✅ ASR Engine Ready (${deviceRef.current}) • ${fmtMs(loadMs)}`);
        dbg("model:", MODEL_ID);
        dbg("device:", deviceRef.current);
        dbg("threads:", env.backends?.onnx?.wasm?.numThreads);
        dbg("wasmPaths:", env.backends?.onnx?.wasm?.wasmPaths);
        console.groupEnd();

        setReady(true);
        setBusy(false);
        setProgress({ pct: 100, file: "" });
        setStatusText(`✅ Neural Engine Ready (${deviceRef.current}) • ${fmtMs(loadMs)}`);

        return transcriber;
      } catch (err) {
        const msg = err?.message || String(err);
        dbe("❌ [HOOK] Load failed:", err);
        setReady(false);
        setBusy(false);
        setStatusText(`❌ Load error: ${msg}`);
        throw err;
      } finally {
        clearInterval(stallTimer);
        loadingPromiseRef.current = null;
      }
    })();

    return loadingPromiseRef.current;
  }, []);

  // ✅ Auto-load
  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const transcribe = useCallback(
    async (blob) => {
      if (!blob) return null;

      setBusy(true);
      setStatusText(`🎙️ Decoding… (${deviceRef.current})`);

      try {
        const transcriber = transcriberRef.current || (await load());

        const tAll0 = performance.now();

        // Decode audio to float32 @ 16k
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 16000,
        });
        const arrayBuffer = await blob.arrayBuffer();
        const decoded = await audioCtx.decodeAudioData(arrayBuffer);
        const audioData = decoded.getChannelData(0);
        try {
          await audioCtx.close();
        } catch {}

        const audioSec = Number.isFinite(decoded?.duration)
          ? decoded.duration
          : audioData.length / 16000;

        const decodeMs = Math.round(performance.now() - tAll0);
        metricsRef.current.lastDecodeMs = decodeMs;
        metricsRef.current.lastAudioSec = audioSec;

        // Keep your beams/tokens logic (not design)
        const fastBeams = deviceRef.current === "wasm" ? 1 : 5;
        const maxTokens = deviceRef.current === "wasm" ? 256 : 448;

        const tInfer0 = performance.now();

        // 🔒 INT8 PATCH: match your working HTML inference (no forced_decoder_ids)
        const result = await transcriber(audioData, {
          language: "mongolian",
          task: "transcribe",
          condition_on_previous_text: false,
          repetition_penalty: 1.1,
          return_timestamps: false,
          chunk_length_s: 30,
          stride_length_s: 5,
          generate_kwargs: {
            num_beams: fastBeams,
            temperature: 0,
            max_new_tokens: maxTokens,
          },
        });

        const inferMs = Math.round(performance.now() - tInfer0);
        const totalMs = Math.round(performance.now() - tAll0);

        const text = result?.text ?? "";
        const rtf = audioSec > 0 ? inferMs / 1000 / audioSec : null;
        const speedX = rtf ? 1 / rtf : null;

        metricsRef.current.lastInferMs = inferMs;
        metricsRef.current.lastTotalMs = totalMs;
        metricsRef.current.lastRTF = rtf;
        metricsRef.current.lastTextLen = text.length;
        metricsRef.current.runs += 1;

        const rtfStr = rtf == null ? "n/a" : rtf.toFixed(2);
        const speedStr = speedX == null ? "" : ` • x${speedX.toFixed(2)} realtime`;

        setStatusText(
          `✅ Done • ${(audioSec || 0).toFixed(2)}s audio • ${fmtMs(inferMs)} infer • RTF ${rtfStr}${speedStr} • beams=${fastBeams}`
        );

        console.groupCollapsed(
          `🧾 ASR #${metricsRef.current.runs} • ${deviceRef.current} • ${(audioSec || 0).toFixed(2)}s → ${fmtMs(inferMs)} • RTF ${rtfStr}${speedStr} • beams=${fastBeams}`
        );
        dbg("decode:", fmtMs(decodeMs));
        dbg("infer:", fmtMs(inferMs));
        dbg("total:", fmtMs(totalMs));
        dbg("audioSec:", (audioSec || 0).toFixed(2));
        dbg("beams:", fastBeams);
        dbg("max_new_tokens:", maxTokens);
        dbg("text_len:", text.length);
        dbg("preview:", text.slice(0, 220));
        console.groupEnd();

        return text;
      } catch (err) {
        const msg = err?.message || String(err);
        dbe("❌ [HOOK] Transcribe failed:", err);
        setStatusText(`❌ Transcribe error: ${msg}`);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [load]
  );

  return { ready, busy, statusText, progress, transcribe };
}

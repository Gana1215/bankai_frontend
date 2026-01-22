import { useCallback, useEffect, useRef, useState } from "react";
import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3";

const DEBUG_ASR = true;
const dbg = (...a) => DEBUG_ASR && console.log(...a);
const dbe = (...a) => DEBUG_ASR && console.error(...a);

// ✅ Local model folder lives in: /public/models/whisper-mongolian-final-js
const MODEL_ID = "models/whisper-mongolian-final-js";

function isIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // iPadOS sometimes reports as Mac; touch is a good hint
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && typeof document !== "undefined" && "ontouchend" in document);
}

function pickDevice() {
  return "wasm";
}


export default function useOnnxTranscriber() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState("Standby");
  const [progress, setProgress] = useState({ pct: 0, file: "" });

  const transcriberRef = useRef(null);
  const loadingPromiseRef = useRef(null);
  const deviceRef = useRef(pickDevice());

  useEffect(() => {
    // Same spirit as your Golden HTML
    env.allowRemoteModels = false;
    env.allowLocalModels = true;

    // ✅ IMPORTANT for Vite: public/models/... is served from "/models/..."
    env.localModelPath = "/";

    // ✅ ORT wasm assets under /public/ort
    if (env.backends?.onnx?.wasm) {
      env.backends.onnx.wasm.wasmPaths = "/ort/";

      // ✅ WASM stability (esp. iOS + non cross-origin-isolated dev servers)
      env.backends.onnx.wasm.numThreads = 1;
      env.backends.onnx.wasm.proxy = true;
    }

    dbg("🧠 [HOOK] Boot.");
    dbg("🧠 [HOOK] WebGPU available:", typeof navigator !== "undefined" ? !!navigator.gpu : false);
    dbg("🧠 [HOOK] iOS detected:", isIOS());
    dbg("🧠 [HOOK] Device selected:", deviceRef.current);
    dbg("🧠 [HOOK] localModelPath=/");
    dbg("🧠 [HOOK] wasmPaths=/ort/");

    if (typeof window !== "undefined") {
      window.__ASR__ = {
        get transcriber() {
          return transcriberRef.current;
        },
        get device() {
          return deviceRef.current;
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

    const progressCb = (p) => {
      if (!p) return;

      if (p.status === "progress") {
        const pct = Math.max(0, Math.min(100, Math.round(p.progress ?? 0)));
        const file = p.file ?? "";
        setProgress({ pct, file });
        setStatusText(`⏳ Loading… ${pct}%`);
        dbg(`[LOAD] ${pct}%`, file);
      } else {
        dbg("[LOAD]", p.status, p.file || "");
        if (p.status === "ready") dbg("[LOAD] ready");
      }
    };

    loadingPromiseRef.current = (async () => {
      try {
        const t0 = performance.now();

        let transcriber = null;

        try {
          transcriber = await pipeline("automatic-speech-recognition", MODEL_ID, {
            device: deviceRef.current,
            dtype: "fp32",
            progress_callback: progressCb,
          });
        } catch (err) {
          // ✅ Critical: if WebGPU fails, auto-fallback to WASM
          const wasWebGPU = deviceRef.current === "webgpu";
          if (wasWebGPU) {
            dbe("⚠️ [HOOK] WebGPU load failed; retrying with WASM…", err);

            deviceRef.current = "wasm";
            setStatusText("⚠️ WebGPU failed — switching to WASM…");
            setProgress({ pct: 0, file: "" });

            transcriber = await pipeline("automatic-speech-recognition", MODEL_ID, {
              device: "wasm",
              dtype: "fp32",
              progress_callback: progressCb,
            });
          } else {
            throw err;
          }
        }

        transcriberRef.current = transcriber;

        const dt = Math.round(performance.now() - t0);
        dbg(`✅ [HOOK] pipeline ready in ${dt}ms`);
        dbg("✅ [HOOK] transcriber keys:", Object.keys(transcriber || {}));

        setReady(true);
        setBusy(false);
        setProgress({ pct: 100, file: "" });
        setStatusText(`✅ Neural Engine Ready (${deviceRef.current})`);

        return transcriber;
      } catch (err) {
        const msg = err?.message || String(err);
        dbe("❌ [HOOK] Load failed:", err);
        setReady(false);
        setBusy(false);
        setStatusText(`❌ Load error: ${msg}`);
        throw err;
      } finally {
        loadingPromiseRef.current = null;
      }
    })();

    return loadingPromiseRef.current;
  }, []);

  // ✅ Auto-load (keeps your StatusPanel alive without extra UI changes)
  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const transcribe = useCallback(
    async (blob) => {
      if (!blob) return null;

      setBusy(true);
      setStatusText("🚀 Neural Decoding: Multi-Beam Inference Active…");

      try {
        const transcriber = transcriberRef.current || (await load());

        // Decode audio to float32 @ 16k (same as Golden HTML idea)
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        const arrayBuffer = await blob.arrayBuffer();
        const decoded = await audioCtx.decodeAudioData(arrayBuffer);
        const audioData = decoded.getChannelData(0);
        try {
          await audioCtx.close();
        } catch {}

        const startTime = performance.now();

        // ✅ COPY your Golden generate_kwargs
        const result = await transcriber(audioData, {
          language: "mongolian",
          task: "transcribe",
          generate_kwargs: {
            forced_decoder_ids: [
              [1, 50259],
              [2, 50314],
              [3, 50363],
            ],
            num_beams: 5,
            repetition_penalty: 1.1,
            temperature: 0,
            max_new_tokens: 448,
          },
        });

        const duration = ((performance.now() - startTime) / 1000).toFixed(2);
        const text = result?.text ?? "";

        dbg(`🧾 [HOOK] infer OK in ${duration}s | text_len=${text.length}`);
        dbg("📝 [HOOK] text preview:", text.slice(0, 180));

        setStatusText(`✅ Done (${duration}s)`);
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

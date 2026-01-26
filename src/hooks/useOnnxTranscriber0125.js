// src/hooks/useOnnxTranscriber.jsx
import { useCallback, useEffect, useRef, useState } from "react";
import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3";

const DEBUG_ASR = true;
const dbg = (...a) => DEBUG_ASR && console.log(...a);
const dbe = (...a) => DEBUG_ASR && console.error(...a);

const MODEL_ID = import.meta.env.VITE_HF_MODEL_ID || "gana1215/WASM_int8";

export default function useOnnxTranscriber() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState("Standby");
  const [progress, setProgress] = useState({ pct: 0, file: "" });

  const transcriberRef = useRef(null);
  const loadingPromiseRef = useRef(null);

  useEffect(() => {
    // --- 1. MODEL FETCH CONFIG ---
    env.allowRemoteModels = true;
    env.allowLocalModels = false; 
    
    // --- 2. THE WASM SPEED PATCH ---
    const wasm = env.backends?.onnx?.wasm;
    if (wasm && typeof window !== "undefined") {
      wasm.wasmPaths = window.location.origin + "/ort/";
      
      // FORCED FASTEST SETUP:
      // On mobile, 2 threads maximize SIMD without hitting thermal walls.
      // Proxy = true keeps the UI thread 100% butter-smooth.
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      wasm.numThreads = isMobile ? 2 : 4; 
      wasm.proxy = true; 
      wasm.simd = true; 
    }

    dbg("🧠 [HOOK] Booted: ULTRA-WASM Mode (INT8)");
  }, []);

  const load = useCallback(async () => {
    if (transcriberRef.current) return transcriberRef.current;
    if (loadingPromiseRef.current) return loadingPromiseRef.current;

    setBusy(true);
    setStatusText(`🔄 Loading Neural Engine...`);

    loadingPromiseRef.current = (async () => {
      try {
        const t0 = performance.now();

        const transcriber = await pipeline(
          "automatic-speech-recognition",
          MODEL_ID,
          {
            device: "wasm", // ⚡️ HARD-LOCKED TO WASM
            dtype: "q8",    // ⚡️ NATIVE INT8 SPEED
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
          }
        );

        transcriberRef.current = transcriber;
        setReady(true);
        setBusy(false);
        setStatusText(`✅ Ready • ${Math.round(performance.now() - t0)}ms`);
        return transcriber;

      } catch (err) {
        dbe("❌ [HOOK] Load failed:", err);
        setStatusText(`❌ Load error: ${err.message}`);
        setReady(false);
        setBusy(false);
        throw err;
      } finally {
        loadingPromiseRef.current = null;
      }
    })();

    return loadingPromiseRef.current;
  }, []);

  useEffect(() => { load().catch(() => {}); }, [load]);

  const transcribe = useCallback(async (blob) => {
    if (!blob || !transcriberRef.current) return null;
    setBusy(true);
    setStatusText(`🎙️ Decoding…`);

    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      const arrayBuffer = await blob.arrayBuffer();
      const decoded = await audioCtx.decodeAudioData(arrayBuffer);
      const audioData = decoded.getChannelData(0);
      await audioCtx.close();

      // --- 3. DECODING SPEED OPTIMIZATION ---
      const result = await transcriberRef.current(audioData, {
        language: "mn",        // Use ISO code for faster token matching
        task: "transcribe",
        return_timestamps: false, // ⚡️ MASSIVE SPEEDUP: Disabling timestamps saves CPU cycles
        generate_kwargs: {
          num_beams: 1,         // Greedy search is significantly faster than beams
          max_new_tokens: 256,
          language: "mn",
          task: "transcribe",
        },
      });

      setStatusText(`✅ Done`);
      return result.text;
    } catch (err) {
      dbe("❌ Transcribe failed:", err);
      setStatusText(`❌ Transcribe error`);
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  return { ready, busy, statusText, progress, transcribe };
}
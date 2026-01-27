// src/hooks/useOnnxTranscriber.jsx
import { useCallback, useEffect, useRef, useState } from "react";
// Import from CDN or your node_modules
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
    // ✅ Force remote loading so it doesn't check your Vite server for JSONs
    env.allowRemoteModels = true;
    env.allowLocalModels = false; 
    //env.localModelPath = null; 
   // env.localModelPath = "/"; // 👈 Changed from null to ""  
    // --- 2. WASM ENGINE CONFIG ---
    const wasm = env.backends?.onnx?.wasm;
    if (wasm && typeof window !== "undefined") {
      // Points to /public/ort/ for the .wasm files
      wasm.wasmPaths = window.location.origin + "/ort/";
      
      // Mobile-safe thread management
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const canThread = typeof crossOriginIsolated !== "undefined" && crossOriginIsolated;
      
      wasm.numThreads = isMobile ? 1 : (canThread ? 4 : 1);
      wasm.proxy = false;
      wasm.simd = true;
    }

    dbg("🧠 [HOOK] Booted: Remote-Only Mode (INT8)");
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
            device: "webgpu",
            dtype: "q8", // Matches your INT8 model
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
        
        // Final sanity check for the user
        if (err.message?.includes("<")) {
          setStatusText("❌ Error: HF Repo is missing config files (returned HTML).");
        } else {
          setStatusText(`❌ Load error: ${err.message}`);
        }
        
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

      const result = await transcriberRef.current(audioData, {
        language: "mongolian",
        task: "transcribe",
        generate_kwargs: {
          num_beams: 1,
          max_new_tokens: 256,
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
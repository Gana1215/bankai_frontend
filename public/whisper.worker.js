// public/whisper.worker.js
// ✅ BankAI Stable Engine Worker — GOLDEN PATCH (Production-ready)
// - Keeps your Stable Engine harness (scoreboard, warnings, hooks)
// - Model comes from ENV (local OR HuggingFace)
// - Uses merged decoder: onnx/decoder_model_merged.onnx
// - Sends {status:"ready"} exactly like your hook expects
// - TRANSCRIBE returns {status:"success", text} (and debug payloads if DEBUG_ASR=true)

//import { pipeline, env } from "@huggingface/transformers";

import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers';


// =========================
// Debug switches
// =========================
const DEBUG_ASR = true; // set false for production silence
const dbg = (...a) => DEBUG_ASR && console.log(...a);
const dbe = (...a) => DEBUG_ASR && console.error(...a);

// =========================
// BOOT ENV (from main thread)
// =========================
// Main thread should send:
// worker.postMessage({ type:"BOOT_ENV", env:{ VITE_MODEL_SOURCE, VITE_LOCAL_ASR_MODEL, VITE_HF_ASR_MODEL } })
self.__ENV__ = self.__ENV__ || {};

// =========================
// MODEL SOURCE SWITCH (env)
// =========================
// VITE_MODEL_SOURCE=local | hf
// VITE_LOCAL_ASR_MODEL=whisper-mongolian-final-js
// VITE_HF_ASR_MODEL=yourname/whisper-mongolian-final-js
function getModelConfig() {
  const SOURCE = (self?.__ENV__?.VITE_MODEL_SOURCE || "local").toLowerCase().trim();
  const LOCAL_NAME = (self?.__ENV__?.VITE_LOCAL_ASR_MODEL || "whisper-mongolian-final-js").trim();
  const HF_ID = (self?.__ENV__?.VITE_HF_ASR_MODEL || "").trim();

  // In local mode, we load from /public/models/<LOCAL_NAME> by using MODEL_ID: "models/<LOCAL_NAME>"
  // and env.localModelPath = "/"
  const MODEL_ID = SOURCE === "hf" ? HF_ID : `models/${LOCAL_NAME}`;

  return { SOURCE, LOCAL_NAME, HF_ID, MODEL_ID };
}

// Scoreboard for loop-breaker harness
let SCORE = { loaded: false, forced: false, enc: false, gen: false, text: false, warn: false };
let lastWarn = "";
let forcedDecoderIds = null;
let transcriber = null;
let lastAudio = null;

function report(extra = {}) {
  self.postMessage({ type: "SCORE", ...SCORE, ...extra });
}

// Helper to resolve token -> id across tokenizer API variants
function tokenId(tok, s) {
  if (!tok) throw new Error("tokenizer missing");
  const maps = [tok?.model?.tokens_to_ids, tok?.tokens_to_ids, tok?.vocab].filter(Boolean);
  for (const m of maps) {
    try {
      if (typeof m.get === "function" && m.get(s) !== undefined) return m.get(s);
      if (typeof m === "object" && m[s] !== undefined) return m[s];
    } catch {}
  }
  if (typeof tok.convert_tokens_to_ids === "function") return tok.convert_tokens_to_ids(s);
  if (tok.model && typeof tok.model.token_to_id === "function") return tok.model.token_to_id(s);
  throw new Error("No token->id method found on tokenizer");
}

console.log("🧠 [WORKER] ✅ Stable Engine (Golden patched) booting…");

// =========================
// ENV (must match your public paths)
// =========================
// We'll set allowLocal/allowRemote dynamically at LOAD time after we know SOURCE.
env.backends.onnx.wasm.wasmPaths = "/ort/";
env.backends.onnx.wasm.numThreads = 1; // keep conservative for Safari/mobile

// Patch console.warn to catch KV warnings
const origWarn = console.warn.bind(console);
console.warn = (...args) => {
  const msg = args.map((a) => String(a)).join(" ");
  if (msg.includes("Too many inputs were provided") || msg.includes("past_key_values")) {
    SCORE.warn = true;
    lastWarn = msg;
    report({ stage: "warn", lastWarn });
  }
  origWarn(...args);
};

// Sine generator for TEST_SYNTH
function makeSine(durationSec = 1, freq = 440, sr = 16000) {
  const len = Math.floor(durationSec * sr);
  const out = new Float32Array(len);
  const twoPiF = 2 * Math.PI * freq;
  for (let i = 0; i < len; i++) out[i] = Math.sin((twoPiF * i) / sr);
  return out;
}

// =========================
// Shared transcription routine
// =========================
const runTranscribe = async (audioInput) => {
  // IMPORTANT: keep generate kwargs stable to avoid "H" / wrong language regressions
  const output = await transcriber(audioInput, {
    sampling_rate: 16000,
    return_timestamps: false,
    chunk_length_s: 30,
    stride_length_s: 5,

    // Keep decoding deterministic
    generate_kwargs: {
      language: "mn",
      task: "transcribe",
      num_beams: 1,
      temperature: 0,
      do_sample: false,
      use_cache: false,
      // forced_decoder_ids also reinforced below (config + generation_config)
    },

    // extra safety (some engine versions look for these top-level knobs)
    use_cache: false,
    max_new_tokens: 128,
  });

  const tokenArr = output?.tokens ?? output?.sequences?.[0] ?? null;
  const tokenLen = Array.isArray(tokenArr) ? tokenArr.length : tokenArr?.length ?? null;
  const textLen = (output?.text ?? "").length;
  if (textLen > 0) SCORE.text = true;

  report({ stage: "transcribe_done", text_len: textLen, token_len: tokenLen });
  return output;
};

self.onmessage = async (e) => {
  const { type, audio, env: bootEnv } = e.data || {};

  // -------------------------
  // BOOT ENV
  // -------------------------
  if (type === "BOOT_ENV") {
    self.__ENV__ = bootEnv || {};
    const cfg = getModelConfig();
    console.log("✅ [WORKER] BOOT_ENV received:", cfg);
    self.postMessage({ type: "BOOT_ENV_OK", cfg });
    return;
  }

  if (type === "PING") {
    self.postMessage({ type: "PONG", loaded: !!transcriber });
    report({ stage: "pong", loaded: !!transcriber });
    return;
  }

  if (type === "LOAD") {
    try {
      const cfg = getModelConfig();
      const { SOURCE, MODEL_ID, LOCAL_NAME, HF_ID } = cfg;

      // -------------------------
      // Dynamic env setup (local vs hf)
      // -------------------------
      if (SOURCE === "hf") {
        if (!HF_ID) throw new Error("VITE_HF_ASR_MODEL is empty but VITE_MODEL_SOURCE=hf");
        env.allowRemoteModels = true;
        env.allowLocalModels = false; // strict
      } else {
        env.allowRemoteModels = false;
        env.allowLocalModels = true;
        env.localModelPath = "/"; // so MODEL_ID "models/<name>" => "/models/<name>"
      }

      console.log("🚀 [WORKER] Initializing GOLDEN Mongolian Whisper…", {
        SOURCE,
        MODEL_ID,
        LOCAL_NAME,
        HF_ID,
      });

      report({ stage: "loading", model: MODEL_ID, source: SOURCE });

      transcriber = await pipeline("automatic-speech-recognition", MODEL_ID, {
        // ✅ local-only when SOURCE != hf
        local_files_only: SOURCE !== "hf",

        // ✅ Stable runtime
        device: "wasm",
        quantized: false,

        // ✅ Golden merged decoder
        is_decoder_merged: true,
        use_cache: false,

        // ✅ Explicit model file names (keeps it deterministic)
        model_file_names: {
          encoder: "onnx/encoder_model.onnx",
          decoder_merged: "onnx/decoder_model_merged.onnx",
        },

        // ✅ Minimal deterministic generation defaults
        generation_config: {
          num_beams: 1,
          do_sample: false,
          temperature: 0,
          use_cache: false,
        },

        progress_callback: (p) => {
          if (p?.status === "progress") {
            console.log(`[WORKER] ⏳ Loading ${p.file}: ${Math.round(p.progress)}%`);
          }
        },
      });

      SCORE.loaded = true;
      report({ stage: "loaded", model: MODEL_ID, source: SOURCE });

      // ✅ Forced decoder ids once (positions 0,1) to pin Mongolian
      try {
        const tok = transcriber?.tokenizer;
        const SOT = tokenId(tok, "<|startoftranscript|>");
        const MN = tokenId(tok, "<|mn|>");

        const fdi = [
          [0, SOT],
          [1, MN],
        ];
        forcedDecoderIds = fdi;

        if (transcriber?.model?.config) {
          transcriber.model.config.forced_decoder_ids = fdi;
          transcriber.model.config.use_cache = false;
        }
        if (transcriber?.model?.generation_config) {
          transcriber.model.generation_config.forced_decoder_ids = fdi;
          transcriber.model.generation_config.use_cache = false;
        }

        SCORE.forced = true;
        report({ stage: "forced_set", forced_decoder_ids: fdi });
        dbg("[DEBUG] forced_decoder_ids set:", fdi);
      } catch (fdErr) {
        dbe("[DEBUG] forced_decoder_ids setup error:", fdErr);
      }

      // Hooks (optional) — keep but safe
      try {
        const enc = transcriber?.model?.encoder;
        if (enc?.forward) {
          const origEncForward = enc.forward.bind(enc);
          enc.forward = async (...args) => {
            const out = await origEncForward(...args);
            try {
              const hs = out?.last_hidden_state;
              const dims = hs?.dims ?? hs?.shape ?? hs?._shape ?? null;
              const dtype = hs?.type ?? hs?.dtype ?? null;
              if (!SCORE.enc) {
                SCORE.enc = true;
                report({ stage: "enc", dims, dtype });
              }
              dbg("[DEBUG] Encoder forward -> dims:", dims, "dtype:", dtype);
            } catch (err) {
              dbe("[DEBUG] Encoder hook error:", err);
            }
            return out;
          };
        }

        const gen = transcriber?.model?.generate;
        if (gen) {
          const origGen = gen.bind(transcriber.model);
          transcriber.model.generate = async (inputs, options) => {
            const out = await origGen(inputs, options);
            try {
              const seqs = out?.sequences ?? out?.sequences_ids ?? out?.output_ids;
              const firstLen = Array.isArray(seqs) ? seqs[0]?.length ?? null : null;
              if (!SCORE.gen) {
                SCORE.gen = true;
                report({ stage: "gen", token_len: firstLen });
              }
              dbg("[DEBUG] Generate output -> tokens length:", firstLen);
            } catch (err) {
              dbe("[DEBUG] Generate hook post-log error:", err);
            }
            return out;
          };
        }
      } catch (hookErr) {
        dbe("[DEBUG] Hook setup error:", hookErr);
      }

      console.log("✅ [WORKER] GOLDEN Mongolian Whisper is ready.");
      self.postMessage({ status: "ready" });
    } catch (err) {
      console.error("❌ [WORKER] Load Error:", err);
      self.postMessage({ status: "error", error: err?.message || String(err) });
      report({ stage: "load_error", error: err?.message || String(err) });
    }
    return;
  }

  if (type === "TEST_SYNTH") {
    try {
      if (!transcriber) throw new Error("Transcriber not initialized");
      const audioF32 = makeSine(1, 440, 16000);
      lastAudio = audioF32;
      const output = await runTranscribe(audioF32);
      self.postMessage({
        status: "debug",
        stage: "test_synth_done",
        text_len: (output?.text ?? "").length,
        token_len: output?.tokens?.length ?? output?.sequences?.[0]?.length ?? null,
        text: output?.text ?? "",
      });
    } catch (err) {
      dbe("❌ [WORKER] TEST_SYNTH failed:", err);
      self.postMessage({ status: "error", error: err?.message || String(err) });
    }
    return;
  }

  if (type === "DUMP_TOKENS") {
    try {
      if (!transcriber) throw new Error("Transcriber not initialized");
      const audioF32 = audio instanceof Float32Array ? audio : lastAudio;
      if (!audioF32) throw new Error("No audio provided or cached for DUMP_TOKENS");
      const output = await runTranscribe(audioF32);
      const tokens = output?.tokens ?? output?.sequences?.[0] ?? null;
      self.postMessage({
        type: "TOKENS",
        tokens: Array.isArray(tokens) ? tokens.slice(0, 50) : tokens ?? null,
        text: output?.text ?? "",
      });
    } catch (err) {
      dbe("❌ [WORKER] DUMP_TOKENS failed:", err);
      self.postMessage({ status: "error", error: err?.message || String(err) });
    }
    return;
  }

  if (type === "TRANSCRIBE") {
    try {
      if (!transcriber) throw new Error("Transcriber not initialized");

      // normalize audio to Float32Array
      let audioF32;
      if (audio instanceof Float32Array) {
        audioF32 = audio;
      } else if (ArrayBuffer.isView(audio)) {
        audioF32 = new Float32Array(audio.buffer, audio.byteOffset, audio.byteLength / 4);
      } else if (audio instanceof ArrayBuffer) {
        audioF32 = new Float32Array(audio);
      } else if (Array.isArray(audio)) {
        audioF32 = new Float32Array(audio);
      } else {
        throw new Error("Unsupported audio type");
      }
      lastAudio = audioF32;

      // quick audio stats (light)
      if (DEBUG_ASR) {
        const statsLen = Math.min(audioF32.length, 5000);
        let min = Infinity,
          max = -Infinity,
          sumSq = 0,
          zeros = 0;
        for (let i = 0; i < statsLen; i++) {
          const v = audioF32[i];
          if (v === 0) zeros++;
          if (v < min) min = v;
          if (v > max) max = v;
          sumSq += v * v;
        }
        const rms = statsLen ? Math.sqrt(sumSq / statsLen) : 0;
        const silent = Math.abs(max) < 0.01;
        dbg("📊 [WORKER] audio:", audioF32.length, {
          min,
          max,
          rms,
          zeroPct: ((zeros / statsLen) * 100).toFixed(2),
          silent,
        });
      }

      const output = await runTranscribe(audioF32);

      dbg("📝 [WORKER] Text:", output?.text);
      self.postMessage({
        status: "debug",
        stage: "transcribe_done",
        text_len: (output?.text ?? "").length,
        text: output?.text ?? "",
        tokens: output?.tokens ?? output?.sequences?.[0] ?? null,
      });

      self.postMessage({ status: "success", text: output?.text ?? "" });
    } catch (err) {
      dbe("❌ [WORKER] TRANSCRIBE failed:", err);
      self.postMessage({ status: "error", error: err?.message || String(err) });
      report({ stage: "transcribe_error", error: err?.message || String(err) });
    }
  }
};

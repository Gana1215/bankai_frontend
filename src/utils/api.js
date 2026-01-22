// ===============================================
// 🌐 API Base URL (switchable between Local / Render)
// -----------------------------------------------
// ✅ Uses Vite environment variable if available
// ✅ Falls back to Render URL for production
// ✅ Includes REPLY_MODE and TRANS_MODE for hybrid logic
// ===============================================

export const API_BASE =
  import.meta.env.VITE_API_BASE || "https://wstt-demo.onrender.com";

// ===============================================
// 🔊 Reply Mode
// 0 = Static TTS reply (uses pre-generated files)
// 1 = Dynamic TTS reply (uses Edge-TTS)
// ⚙️ Controlled by: VITE_REPLY_MODE in .env
// ===============================================
export const REPLY_MODE = Number(import.meta.env.VITE_REPLY_MODE || 1);

// ===============================================
// 🧠 Transcription Mode
// 0 = Frontend (Local ONNX / Phase 3)
// 1 = Backend (Whisper CT2 / Phase 2A)
// ⚙️ Controlled by: VITE_TRANS_MODE in .env
// ===============================================
export const TRANS_MODE = Number(import.meta.env.VITE_TRANS_MODE || 1);

// ===============================================
// 🎙️ Recorder.jsx — BankAI Recorder (v2.0.3 GAME-CHANGER WAV16K MONO)
// -----------------------------------------------
// ✅ Keeps your STOP FIX logic exactly
// ✅ Recording output is ALWAYS WAV 16k mono PCM16 (both Front + Back modes)
// ✅ Recorder is record-only: App.jsx owns networking
// ===============================================

import React, { useRef, useState, useEffect } from "react";

export default function Recorder({ onStop, transMode }) {
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [level, setLevel] = useState(0);

  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioChunksRef = useRef([]);

  const stopTimeoutRef = useRef(null);
  const mimeRef = useRef("audio/webm");

  const animationRef = useRef(null);
  const analyserRef = useRef(null);
  const audioCtxRef = useRef(null);
  const recordingRef = useRef(false);

  const lastErrorRef = useRef(null);

  const stopRequestedRef = useRef(false);
  const finalizedRef = useRef(false);

  const clearStopTimeout = () => {
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
  };

  const stopViz = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  };

  const stopTracks = () => {
    const stream = mediaStreamRef.current;
    if (!stream) return;
    try {
      stream.getTracks().forEach((t) => t.stop());
    } catch {}
    mediaStreamRef.current = null;
  };

  const closeAudioCtx = async () => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    try {
      await ctx.close?.();
    } catch {}
    audioCtxRef.current = null;
  };

  const cleanup = async () => {
    stopViz();
    analyserRef.current = null;
    stopTracks();
    await closeAudioCtx();
  };

  const finalizeOnce = async (reason) => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;

    clearStopTimeout();
    stopViz();

    try {
      const rawBlob = new Blob(audioChunksRef.current, { type: mimeRef.current });

      // ✅ GAME-CHANGER: Always convert recording to WAV 16k mono PCM16
      const wavBlob = await convertToWav16kMono(rawBlob);

      onStop && onStop(wavBlob);
      setAudioUrl(URL.createObjectURL(wavBlob));
      lastErrorRef.current = null;
      return;
    } catch (err) {
      console.error(`[RECORDER] finalizeOnce failed (${reason}):`, err);
      lastErrorRef.current = err;
      alert("Audio decode failed. Switch to Back mode or try a different browser.");
    } finally {
      recordingRef.current = false;
      setRecording(false);
      await cleanup();
    }
  };

  const startRecording = async () => {
    try {
      stopRequestedRef.current = false;
      finalizedRef.current = false;
      lastErrorRef.current = null;
      clearStopTimeout();

      await cleanup();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      source.connect(analyser);
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const preferredMime = MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
        ? "audio/ogg;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";
      console.log("[RECORDER] Using mimeType:", preferredMime);
      mimeRef.current = preferredMime;

      const mediaRecorder = new MediaRecorder(stream, { mimeType: preferredMime });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e?.data?.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onerror = (e) => {
        console.warn("[RECORDER] MediaRecorder error:", e);
      };

      mediaRecorder.onstop = () => {
        finalizeOnce("onstop");
      };

      mediaRecorder.start(250);
      recordingRef.current = true;
      setRecording(true);
      visualizeLevel();
    } catch (err) {
      console.error("🎤 Mic error:", err);
      recordingRef.current = false;
      setRecording(false);
      await cleanup();
    }
  };

  const stopRecording = () => {
    if (stopRequestedRef.current) {
      recordingRef.current = false;
      setRecording(false);
      stopTracks();
      closeAudioCtx();
      stopViz();
      return;
    }
    stopRequestedRef.current = true;

    recordingRef.current = false;
    setRecording(false);

    const mr = mediaRecorderRef.current;

    try {
      if (mr && mr.state === "recording") {
        try {
          mr.requestData();
        } catch {}
        mr.stop();
      } else {
        finalizeOnce("stop-no-recording-state");
      }
    } catch (err) {
      console.warn("[RECORDER] stop failed:", err);
      finalizeOnce("stop-exception");
    }

    clearStopTimeout();
    stopTimeoutRef.current = setTimeout(() => {
      finalizeOnce("fallback-timeout");
    }, 800);

    stopTracks();
    closeAudioCtx();
    stopViz();
  };

  const visualizeLevel = () => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const update = () => {
      if (stopRequestedRef.current || finalizedRef.current) return;

      analyser.getByteTimeDomainData(dataArray);
      const rms = Math.sqrt(
        dataArray.reduce((a, b) => a + (b - 128) ** 2, 0) / dataArray.length
      );
      setLevel(rms / 128);
      animationRef.current = requestAnimationFrame(update);
    };

    update();
  };

  // =========================================================
  // ✅ GAME-CHANGER WAV ENCODER: decode → mono → resample 16k → PCM16 WAV
  // =========================================================

  const convertToWav16kMono = async (blob) => {
    const buffer = await blob.arrayBuffer();

    // Decode at native sample rate
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    let decoded = null;
    try {
      decoded = await ctx.decodeAudioData(buffer);
    } finally {
      try {
        await ctx.close?.();
      } catch {}
    }

    // Mix to mono Float32
    const mono = mixToMonoFloat32(decoded);

    // Resample to 16k using OfflineAudioContext
    const resampled16k = await resampleFloat32To16k(mono, decoded.sampleRate);

    // Encode PCM16 WAV @ 16k mono
    const wavBuffer = encodeWavPCM16FromFloat32(resampled16k, 16000);
    return new Blob([wavBuffer], { type: "audio/wav" });
  };

  const mixToMonoFloat32 = (audioBuffer) => {
    const n = audioBuffer.numberOfChannels;
    const len = audioBuffer.length;

    if (n === 1) {
      // copy to detach from underlying buffer
      return new Float32Array(audioBuffer.getChannelData(0));
    }

    const out = new Float32Array(len);
    for (let ch = 0; ch < n; ch++) {
      const d = audioBuffer.getChannelData(ch);
      for (let i = 0; i < len; i++) out[i] += d[i];
    }
    const inv = 1 / n;
    for (let i = 0; i < len; i++) out[i] *= inv;
    return out;
  };

  const resampleFloat32To16k = async (monoFloat32, srcSR) => {
    if (!monoFloat32 || monoFloat32.length === 0) return new Float32Array(0);
    if (srcSR === 16000) return monoFloat32;

    // Build a temporary AudioBuffer at srcSR
    const srcLen = monoFloat32.length;
    const srcBuf = new AudioBuffer({ length: srcLen, numberOfChannels: 1, sampleRate: srcSR });
    srcBuf.copyToChannel(monoFloat32, 0);

    const duration = srcLen / srcSR;
    const targetLen = Math.max(1, Math.floor(duration * 16000));

    const offline = new OfflineAudioContext(1, targetLen, 16000);
    const source = offline.createBufferSource();
    source.buffer = srcBuf;
    source.connect(offline.destination);
    source.start(0);

    const rendered = await offline.startRendering();
    return new Float32Array(rendered.getChannelData(0));
  };

  const encodeWavPCM16FromFloat32 = (float32, sampleRate) => {
    const numOfChan = 1;
    const format = 1;
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numOfChan * bytesPerSample;

    const buffer = new ArrayBuffer(44 + float32.length * bytesPerSample);
    const view = new DataView(buffer);

    const writeString = (offset, s) =>
      [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));

    let offset = 0;
    writeString(offset, "RIFF");
    offset += 4;
    view.setUint32(offset, 36 + float32.length * bytesPerSample, true);
    offset += 4;

    writeString(offset, "WAVE");
    offset += 4;

    writeString(offset, "fmt ");
    offset += 4;
    view.setUint32(offset, 16, true);
    offset += 4;
    view.setUint16(offset, format, true);
    offset += 2;
    view.setUint16(offset, numOfChan, true);
    offset += 2;
    view.setUint32(offset, sampleRate, true);
    offset += 4;
    view.setUint32(offset, sampleRate * blockAlign, true);
    offset += 4;
    view.setUint16(offset, blockAlign, true);
    offset += 2;
    view.setUint16(offset, bitDepth, true);
    offset += 2;

    writeString(offset, "data");
    offset += 4;
    view.setUint32(offset, float32.length * bytesPerSample, true);
    offset += 4;

    for (let i = 0; i < float32.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }

    return buffer;
  };

  useEffect(() => {
    return () => {
      clearStopTimeout();
      stopRequestedRef.current = true;
      finalizedRef.current = true;
      stopViz();
      stopTracks();
      closeAudioCtx();

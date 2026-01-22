// ===============================================
// 🎙️ Recorder.jsx — BankAI Recorder (v2.0.2 MODE-SAFE + STOP FIX)
// -----------------------------------------------
// ✅ Keeps your STOP FIX logic exactly
// ✅ Backend mode: returns RAW webm/ogg blob (NO decodeAudioData)
// ✅ Front(Local) mode: converts to WAV PCM16
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

      // Backend mode: no decodeAudioData
      if (String(transMode) === "1") {
        onStop && onStop(rawBlob);
        setAudioUrl(URL.createObjectURL(rawBlob));
        lastErrorRef.current = null;
        return;
      }

      // Front(Local) mode: WAV conversion (PCM16)
      const wavBlob = await convertToWav(rawBlob);
      onStop && onStop(wavBlob);
      setAudioUrl(URL.createObjectURL(wavBlob));
      lastErrorRef.current = null;
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

  const convertToWav = async (blob) => {
    const audioCtx = new AudioContext();
    const buffer = await blob.arrayBuffer();
    let audioBuffer = null;

    try {
      audioBuffer = await audioCtx.decodeAudioData(buffer);
    } catch (err) {
      console.error("[RECORDER] decodeAudioData failed:", err);
      throw err;
    } finally {
      try {
        await audioCtx.close?.();
      } catch {}
    }

    const wavBuffer = encodeWavPCM16(audioBuffer);
    return new Blob([wavBuffer], { type: "audio/wav" });
  };

  const encodeWavPCM16 = (audioBuffer) => {
    const numOfChan = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1;
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numOfChan * bytesPerSample;

    const buffer = new ArrayBuffer(44 + audioBuffer.length * bytesPerSample);
    const view = new DataView(buffer);

    const writeString = (offset, s) =>
      [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));

    let offset = 0;
    writeString(offset, "RIFF");
    offset += 4;
    view.setUint32(offset, 36 + audioBuffer.length * bytesPerSample, true);
    offset += 4;
    writeString(offset, "WAVEfmt ");
    offset += 8;
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
    view.setUint32(offset, audioBuffer.length * bytesPerSample, true);
    offset += 4;

    const channelData = audioBuffer.getChannelData(0);
    for (let i = 0; i < channelData.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, channelData[i]));
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
      try {
        const mr = mediaRecorderRef.current;
        if (mr && mr.state === "recording") mr.stop();
      } catch {}
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center">
      <button
        onClick={recording ? stopRecording : startRecording}
        className={`rounded-full p-8 shadow-lg transition-all duration-300 ${
          recording ? "bg-red-500 hover:bg-red-600 scale-110" : "bg-blue-500 hover:bg-blue-600"
        }`}
      >
        <span className="text-white text-2xl">{recording ? "🛑" : "🎙️"}</span>
      </button>

      <div className="w-40 h-2 bg-gray-200 rounded-full mt-4 overflow-hidden">
        <div
          className="h-full bg-green-500 transition-all duration-75"
          style={{ width: `${Math.min(level * 100, 100)}%` }}
        />
      </div>

      {audioUrl && <audio controls src={audioUrl} className="mt-4 rounded-lg shadow" />}
    </div>
  );
}

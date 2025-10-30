// ===============================================
// 🎙️ Recorder.jsx — BankAI Recorder (v1.2.1 Final)
// -----------------------------------------------
// ✅ Clean 16-bit PCM WAV output (mono, 44.1 kHz)
// ✅ iOS/Android/Desktop compatible (MediaRecorder)
// ✅ Emits WAV blob to parent (onStop)
// ✅ Used in App.jsx → uploads → /transcribe → /intent/classify
// ===============================================

import React, { useRef, useState, useEffect } from "react";

export default function Recorder({ onStop }) {
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [level, setLevel] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const animationRef = useRef(null);
  const analyserRef = useRef(null);
  const audioCtxRef = useRef(null);

  // 🎙️ Start Recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      // 🎛️ For amplitude bar
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx({ latencyHint: "interactive" });
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

        const wavBlob = await encodeWavPCM16(audioBuffer);
        const url = URL.createObjectURL(wavBlob);
        setAudioUrl(url);
        onStop && onStop(wavBlob);
      };

      mediaRecorder.start();
      setRecording(true);
      visualizeLevel();
    } catch (err) {
      console.error("🎙️ Mic access error:", err);
    }
  };

  // 🛑 Stop Recording
  const stopRecording = () => {
    setRecording(false);
    if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
  };

  // 🔊 Amplitude visualizer
  const visualizeLevel = () => {
    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const update = () => {
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      setLevel(avg / 256);
      animationRef.current = requestAnimationFrame(update);
    };
    update();
  };

  // 🎧 Helper: Encode to PCM16 WAV
  async function encodeWavPCM16(audioBuffer) {
    const sampleRate = 44100;
    const numChannels = 1;
    const offlineCtx = new OfflineAudioContext(
      numChannels,
      audioBuffer.duration * sampleRate,
      sampleRate
    );
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start(0);

    const rendered = await offlineCtx.startRendering();
    const channelData = rendered.getChannelData(0);
    const buffer = new ArrayBuffer(44 + channelData.length * 2);
    const view = new DataView(buffer);

    const writeString = (o, s) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
    writeString(0, "RIFF");
    view.setUint32(4, 36 + channelData.length * 2, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true);
    view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, channelData.length * 2, true);

    let offset = 44;
    for (let i = 0; i < channelData.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, channelData[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Blob([buffer], { type: "audio/wav" });
  }

  // 🧹 Cleanup
  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (audioCtxRef.current) audioCtxRef.current.close();
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
        ></div>
      </div>

      {audioUrl && (
        <audio controls src={audioUrl} className="mt-4 rounded-lg shadow" />
      )}
    </div>
  );
}

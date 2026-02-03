// src/components/Transaction.jsx
// ✅ FINAL LOCKED UI PATCH: WIDE + SHORT (desktop one-screen), FROM on top,
// ✅ Verify/Confirm always works with clear error,
// ✅ Locked amount combine: 9999 төг 89 мөнгө -> 9999.89
// ✅ Keeps your working recorder + normalize logic (no account mic disable issue)
// ✅ PATCHED: IBAN+Account inputs digits-only
// ✅ PATCHED: Success message always visible (scroll to top), no auto-close

import React, { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { API_BASE } from "../utils/api";

// ---------------------------
// helpers
// ---------------------------
async function fetchJson(res) {
  const txt = await res.text();
  let json;
  try {
    json = JSON.parse(txt);
  } catch {
    json = { detail: txt || "Non-JSON response" };
  }
  if (!res.ok) throw new Error(json?.detail || `HTTP ${res.status}`);
  return json;
}

function prettyMNT(x) {
  if (typeof x !== "number" || !Number.isFinite(x)) return "—";
  const hasDp = Math.abs(x - Math.round(x)) > 1e-9;
  const s = x.toLocaleString("en-US", {
    minimumFractionDigits: hasDp ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return `${s} ₮`;
}

function onlyDigits(x) {
  return String(x || "").replace(/[^\d]/g, "");
}

function inferExtFromMime(mime = "") {
  const m = String(mime).toLowerCase();
  if (m.includes("webm")) return "webm";
  if (m.includes("mp4") || m.includes("m4a")) return "mp4";
  if (m.includes("wav")) return "wav";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  return "webm";
}

function pickBestMimeType() {
  const cands = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/mpeg"];
  for (const t of cands) {
    try {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t;
    } catch {}
  }
  return "";
}

function genTxnId() {
  return `tx_${Math.random().toString(16).slice(2, 10)}`;
}

// ✅ LOCKED combine: 9999 төг 89 мөнгө -> 9999.89
function combineAmount(tugrug, mongo) {
  const t = Number.isFinite(tugrug) ? Math.trunc(Number(tugrug)) : 0;
  const m = Number.isFinite(mongo) ? Math.max(0, Math.min(99, Math.trunc(Number(mongo)))) : 0;
  if (t <= 0) return null; // tugrug required > 0
  return Number((t + m / 100).toFixed(2));
}

// masked display for confirm
function maskTo(toAcc) {
  const s = String(toAcc || "");
  if (!s) return "—";
  if (s.length <= 6) return s;
  return `${s.slice(0, 2)}${"•".repeat(Math.max(0, s.length - 6))}${s.slice(-4)}`;
}

// ---------------------------
// UI components (unchanged style)
// ---------------------------
function Pill({ status }) {
  const cls =
    status === "ok"
      ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
      : status === "recording"
      ? "bg-rose-500/15 text-rose-700 border-rose-500/30"
      : status === "normalizing"
      ? "bg-blue-500/15 text-blue-700 border-blue-500/30"
      : status === "error"
      ? "bg-amber-500/15 text-amber-700 border-amber-500/30"
      : "bg-zinc-500/10 text-zinc-700 border-zinc-500/20";

  const label =
    status === "ok"
      ? "OK"
      : status === "recording"
      ? "REC"
      : status === "normalizing"
      ? "..."
      : status === "error"
      ? "ERR"
      : "IDLE";

  return (
    <span className={`px-2 py-1 text-[10px] font-mono uppercase rounded-full border ${cls}`}>
      {label}
    </span>
  );
}

function StepPill({ active, label }) {
  return (
    <span
      className={[
        "px-2 py-1 text-[10px] font-mono uppercase rounded-full border transition",
        active
          ? "bg-zinc-900 text-white border-zinc-900 shadow-sm"
          : "bg-white text-zinc-700 border-zinc-200",
      ].join(" ")}
    >
      {label}
    </span>
  );
}

function Card({ title, subtitle, status, error, children, right, tone = "blue" }) {
  const toneCls =
    tone === "emerald"
      ? "from-emerald-50/80 via-white to-white"
      : tone === "amber"
      ? "from-amber-50/80 via-white to-white"
      : "from-blue-50/70 via-teal-50/40 to-white";

  return (
    <div className={`rounded-2xl border border-zinc-200 bg-gradient-to-br ${toneCls} p-3 shadow-sm`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-zinc-900">{title}</div>
            {right}
          </div>
          <div className="text-[11px] text-zinc-500 truncate">{subtitle}</div>
        </div>
        <Pill status={status} />
      </div>

      <div className="mt-3">{children}</div>

      {error ? (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function Chip({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-zinc-200 bg-white/90 px-3 py-1 text-xs text-zinc-700 hover:bg-white active:scale-[0.98] shadow-sm"
    >
      {label}
    </button>
  );
}

function MicButton({ status, onClick, disabled, title }) {
  const isRec = status === "recording";
  const isBusy = status === "normalizing";
  const icon = isRec ? "⏹️" : isBusy ? "⏳" : "🎙️";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={[
        "absolute right-2 top-1/2 -translate-y-1/2",
        "h-10 w-10 rounded-full border",
        "flex items-center justify-center",
        "shadow-sm active:scale-[0.98] transition",
        disabled ? "opacity-50" : "hover:shadow-md",
        isRec
          ? "bg-rose-600 text-white border-rose-600"
          : isBusy
          ? "bg-blue-600 text-white border-blue-600"
          : "bg-white text-zinc-900 border-zinc-200 hover:bg-zinc-50",
      ].join(" ")}
    >
      <span className={isRec ? "animate-pulse" : ""}>{icon}</span>
      {isRec ? (
        <span className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-rose-400/50 animate-pulse" />
      ) : null}
    </button>
  );
}

function BigField({ label, prefix, value, onChange, placeholder, rightButton, inputMode = "numeric" }) {
  return (
    <div className="relative">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold text-zinc-700">{label}</div>
      </div>

      <div className="relative">
        {prefix ? (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-sm font-semibold text-zinc-800">
            {prefix}
          </div>
        ) : null}

        <input
          className={[
            "w-full rounded-2xl border border-zinc-200 bg-white",
            "px-4 py-3 text-[16px] font-semibold text-zinc-900",
            "outline-none focus:ring-2 focus:ring-zinc-200",
            "shadow-[inset_0_1px_0_rgba(0,0,0,0.03)]",
            prefix ? "pl-16 pr-14" : "pr-14",
          ].join(" ")}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          inputMode={inputMode}
        />

        {rightButton}
      </div>
    </div>
  );
}

function MiniDebug({ title, stt, fixed }) {
  if (!stt && !fixed) return null;
  return (
    <div className="mt-2 rounded-xl border border-zinc-200 bg-white/70 p-2">
      <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{title}</div>
      {stt ? (
        <div className="mt-1 text-xs text-zinc-700 break-words">
          <span className="text-zinc-500">STT:</span> {stt}
        </div>
      ) : null}
      {fixed ? (
        <div className="mt-1 text-xs text-zinc-700 break-words">
          <span className="text-zinc-500">FIX:</span> {fixed}
        </div>
      ) : null}
    </div>
  );
}

function Select({ label, value, options, onChange }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white/70 p-3">
      <div className="text-xs font-semibold text-zinc-700 mb-2">{label}</div>
      <select
        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
        value={value}
        onChange={onChange}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------
// component (KEEP ALL LOGIC) + UI PATCHED
// ---------------------------
export default function Transaction({ initialTranscript = "", userId = "usr001", onClose }) {
  // ✅ top anchor for scrolling success into view
  const topRef = useRef(null);

  // fields
  const [ibanDigits, setIbanDigits] = useState("");
  const [accountDigits, setAccountDigits] = useState("");

  // ✅ amount = tugrug + mongo
  const [amountTugrug, setAmountTugrug] = useState(null);
  const [amountMongo, setAmountMongo] = useState(0);
  const [amountValue, setAmountValue] = useState(null);
  const [memo, setMemo] = useState("");

  // masked/pretty
  const [ibanMasked, setIbanMasked] = useState("");
  const [accountMasked, setAccountMasked] = useState("");
  const [amountPretty, setAmountPretty] = useState("");

  // per-slot status + errors
  const [slotStatus, setSlotStatus] = useState({ iban: "idle", account: "idle", amount: "idle" });
  const [slotErr, setSlotErr] = useState({ iban: null, account: null, amount: null });

  // amount step
  const [amountStep, setAmountStep] = useState("tugrug"); // "tugrug" | "mongo"

  // per-slot transcript/fix preview
  const [slotDbg, setSlotDbg] = useState({
    iban: { stt: "", fixed: "" },
    account: { stt: "", fixed: "" },
    amount_tugrug: { stt: "", fixed: "" },
    amount_mongo: { stt: "", fixed: "" },
  });

  // from accounts
  const [fromAccounts, setFromAccounts] = useState([]);
  const [fromAcc, setFromAcc] = useState("");
  const [fromBusy, setFromBusy] = useState(false);
  const [fromErr, setFromErr] = useState("");

  // confirm/execute
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [execBusy, setExecBusy] = useState(false);
  const [result, setResult] = useState(null);

  const anyBusy =
    slotStatus.iban === "recording" ||
    slotStatus.account === "recording" ||
    slotStatus.amount === "recording" ||
    slotStatus.iban === "normalizing" ||
    slotStatus.account === "normalizing" ||
    slotStatus.amount === "normalizing";

  const ibanFull = useMemo(() => {
    const d = onlyDigits(ibanDigits);
    return d ? `MN${d}` : "";
  }, [ibanDigits]);

  const cleanAccount = useMemo(() => onlyDigits(accountDigits), [accountDigits]);

  const toAcc = useMemo(() => ibanFull || cleanAccount || "", [ibanFull, cleanAccount]);

  // ✅ Strict verify error (so Verify/Confirm always behaves predictably)
  const verifyErr = useMemo(() => {
    if (!fromAcc) return "From account сонгоно уу";
    if (!toAcc) return "To account/IBAN хоосон байна";
    if (amountValue == null || Number(amountValue) <= 0) return "Amount буруу байна";
    return "";
  }, [fromAcc, toAcc, amountValue]);

  const canConfirm = useMemo(() => !verifyErr, [verifyErr]);

  const memoHints = ["түрээс", "өр төлөлт", "хоол", "тээвэр", "бэлэг", "ажлын хөлс"];

  // ---------------------------
  // load from-accounts
  // ---------------------------
  useEffect(() => {
    let dead = false;

    const run = async () => {
      setFromBusy(true);
      setFromErr("");
      try {
        const res = await fetch(`${API_BASE}/txn/from_accounts`);
        const j = await fetchJson(res);
        const accs = Array.isArray(j?.accounts) ? j.accounts : [];
        if (dead) return;

        setFromAccounts(accs);

        // auto pick first if not selected
        if (!fromAcc && accs.length > 0) setFromAcc(accs[0]);
      } catch (e) {
        if (dead) return;
        setFromErr(e?.message || String(e));
      } finally {
        if (!dead) setFromBusy(false);
      }
    };

    run();
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------
  // recorder (unchanged)
  // ---------------------------
  const streamRef = useRef(null);
  const recRef = useRef(null);
  const chunksRef = useRef([]);

  const activeSlotRef = useRef(null);
  const activeUiRef = useRef(null);

  const stopAll = useCallback(() => {
    try {
      recRef.current?.stop?.();
    } catch {}
    recRef.current = null;

    try {
      streamRef.current?.getTracks?.().forEach((t) => t.stop());
    } catch {}
    streamRef.current = null;

    chunksRef.current = [];
    activeSlotRef.current = null;
    activeUiRef.current = null;
  }, []);

  const sendOnceToBackend = useCallback(
    async (slot, currentText, blob) => {
      const fd = new FormData();
      fd.append("slot", slot);
      fd.append("user_id", userId);
      fd.append("prefix_locked", "MN");
      fd.append("current_text", currentText || "");

      const ext = inferExtFromMime(blob?.type || "");
      fd.append("file", blob, `slot_${slot}.${ext}`);

      const res = await fetch(`${API_BASE}/txn/normalize_slot`, { method: "POST", body: fd });
      return await fetchJson(res);
    },
    [userId]
  );

  const applyNormalizeResult = useCallback((slot, out) => {
    const stt = out?.stt_text || out?.user_text || out?.transcript || "";
    const fixed = out?.normalized?.fixed_text || out?.fixed_text || out?.normalized_text || "";

    setSlotDbg((p) => ({
      ...p,
      [slot]: { stt: String(stt || ""), fixed: String(fixed || "") },
    }));

    const n = out?.normalized || out || {};

    if (slot === "iban") {
      const d = onlyDigits(n?.iban_digits ?? "");
      if (d) {
        setIbanDigits(d);
        setIbanMasked(n?.masked || "");
        if (d) setAccountDigits("");
      }
    } else if (slot === "account") {
      const d = onlyDigits(n?.account_digits ?? "");
      if (d) {
        setAccountDigits(d);
        setAccountMasked(n?.masked || "");
      }
    } else if (slot === "amount_tugrug") {
      if (n?.amount_value != null) {
        const tug = Number(n.amount_value);
        if (Number.isFinite(tug)) setAmountTugrug(Math.max(0, Math.trunc(tug)));
      }
    } else if (slot === "amount_mongo") {
      if (n?.amount_value != null) {
        const m = Number(n.amount_value);
        const mm = Number.isFinite(m) ? Math.max(0, Math.min(99, Math.trunc(m))) : 0;
        setAmountMongo(mm);
      } else {
        setAmountMongo((v) => (v == null ? 0 : v));
      }
    }
  }, []);

  const startRecording = useCallback(
    async (slot, uiSlot, currentText) => {
      if (anyBusy) throw new Error("Busy. Please wait…");

      stopAll();

      activeSlotRef.current = slot;
      activeUiRef.current = uiSlot;
      chunksRef.current = [];

      setSlotErr((p) => ({ ...p, [uiSlot]: null }));
      setSlotStatus((p) => ({ ...p, [uiSlot]: "recording" }));

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;

      const mimeType = pickBestMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recRef.current = rec;

      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      rec.onerror = () => {
        setSlotStatus((p) => ({ ...p, [uiSlot]: "error" }));
        setSlotErr((p) => ({ ...p, [uiSlot]: "Recorder error" }));
        stopAll();
      };

      rec.onstop = async () => {
        const activeSlot = slot;
        const activeUi = uiSlot;

        setSlotStatus((p) => ({ ...p, [activeUi]: "normalizing" }));

        try {
          const mime = rec.mimeType || mimeType || "";
          const blob = new Blob(chunksRef.current, { type: mime || "audio/webm" });
          chunksRef.current = [];

          if (!blob || blob.size < 2000) throw new Error("Audio too short. Please record again.");

          const out = await sendOnceToBackend(activeSlot, currentText || "", blob);
          applyNormalizeResult(activeSlot, out);
          setSlotStatus((p) => ({ ...p, [activeUi]: "ok" }));
        } catch (e) {
          setSlotStatus((p) => ({ ...p, [activeUi]: "error" }));
          setSlotErr((p) => ({ ...p, [activeUi]: e?.message || String(e) }));
        } finally {
          stopAll();
        }
      };

      rec.start();
    },
    [anyBusy, stopAll, sendOnceToBackend, applyNormalizeResult]
  );

  const stopRecording = useCallback(() => {
    const ui = activeUiRef.current;
    if (!ui) return;
    try {
      recRef.current?.stop?.();
    } catch {
      stopAll();
      setSlotStatus((p) => ({ ...p, [ui]: "idle" }));
    }
  }, [stopAll]);

  const toggleRecord = useCallback(
    async (slot, uiSlot, currentText) => {
      const isRec = activeUiRef.current === uiSlot && slotStatus[uiSlot] === "recording";
      if (isRec) {
        stopRecording();
        return;
      }
      await startRecording(slot, uiSlot, currentText);
    },
    [slotStatus, startRecording, stopRecording]
  );

  // ---------------------------
  // ✅ amount combine (LOCKED)
  // ---------------------------
  useEffect(() => {
    const combined = combineAmount(amountTugrug, amountMongo);

    if (combined == null) {
      setAmountValue(null);
      setAmountPretty("");
      return;
    }

    setAmountValue(combined);
    setAmountPretty(prettyMNT(combined));
  }, [amountTugrug, amountMongo]);

  // ---------------------------
  // verify/confirm/execute
  // ---------------------------
  const openConfirm = () => {
    if (verifyErr) {
      setResult({ error: verifyErr });
      // scroll to top to show error if user is down
      setTimeout(() => topRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }), 50);
      return;
    }
    setResult(null);
    setConfirmOpen(true);
  };

  const doExecute = async () => {
    if (!canConfirm || !toAcc) return;
    setExecBusy(true);
    setResult(null);

    try {
      const txnId = genTxnId();
      const transAmount = amountValue; // ✅ already combined, 2dp, float

      const res = await fetch(`${API_BASE}/txn/tx/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txn_id: txnId,
          from_acc: fromAcc,
          to_acc: toAcc,
          trans_amount: transAmount, // ✅ 9999.89
          memo: memo || "",
          approved: "N",
        }),
      });

      const data = await fetchJson(res);
      setResult(data);
      setConfirmOpen(false);

      // ✅ ensure user SEE success message (you might be at bottom)
      setTimeout(() => topRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }), 80);

      // ✅ NO auto-close (keep the success visible)
      // if (data?.approved === "Y") setTimeout(() => onClose?.(), 2500);
    } catch (e) {
      setResult({ error: e?.message || String(e) });
      setTimeout(() => topRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }), 80);
    } finally {
      setExecBusy(false);
    }
  };

  // cleanup on unmount
  useEffect(() => {
    return () => stopAll();
  }, [stopAll]);

  return (
    <div className="space-y-3">
      {/* ✅ TOP ANCHOR */}
      <div ref={topRef} />

      {/* Success reply panel */}
      {result?.approved === "Y" ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          ✅ {result.reply_text || "Таны гүйлгээ, шилжүүлэг хийх хүсэлтийг илгээлээ"}
          <div className="text-xs text-emerald-700 mt-1">
            Txn ID: <span className="font-mono">{result.txn_id}</span>
          </div>

          {/* Optional close button on success */}
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => onClose?.()}
              className="rounded-xl border border-emerald-200 bg-white px-3 py-1 text-xs text-emerald-800 hover:bg-emerald-50 shadow-sm"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      {result?.error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {result.error}
        </div>
      ) : null}

      {initialTranscript ? (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-700">
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            Transcript
          </span>
          <div className="mt-1 break-words">{initialTranscript}</div>
        </div>
      ) : null}

      {/* ✅ WIDE + SHORT LAYOUT */}
      <div className="grid grid-cols-1 gap-3">
        {/* FROM on top (best design) */}
        <div className="space-y-2">
          <Select
            label="From account"
            value={fromAcc}
            options={
              fromAccounts.length
                ? fromAccounts.map((a) => ({ value: a, label: a }))
                : [{ value: "", label: fromBusy ? "Loading..." : "No accounts" }]
            }
            onChange={(e) => setFromAcc(e.target.value)}
          />
          {fromErr ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
              {fromErr}
            </div>
          ) : null}
        </div>

        {/* 2x2 dashboard on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
          {/* IBAN */}
          <Card
            title="IBAN"
            subtitle="MN locked + digits (record once)"
            status={slotStatus.iban}
            error={slotErr.iban}
            tone="blue"
            right={ibanMasked ? <span className="text-[11px] text-zinc-500">{ibanMasked}</span> : null}
          >
            <BigField
              label="IBAN digits"
              prefix="MN"
              value={ibanDigits}
              placeholder="12567890123456..."
              onChange={(e) => {
                // ✅ digits-only always
                const v = onlyDigits(e.target.value);
                setIbanDigits(v);
                if (v) setAccountDigits("");
              }}
              rightButton={
                <MicButton
                  status={slotStatus.iban}
                  onClick={() => toggleRecord("iban", "iban", ibanDigits)}
                  disabled={slotStatus.iban === "normalizing" || (anyBusy && slotStatus.iban !== "recording")}
                  title="Start/Stop IBAN"
                />
              }
            />
            <MiniDebug title="IBAN STT / FIX" stt={slotDbg.iban?.stt} fixed={slotDbg.iban?.fixed} />
          </Card>

          {/* ACCOUNT */}
          <Card
            title="Account"
            subtitle="Digits only (record once)"
            status={slotStatus.account}
            error={slotErr.account}
            tone="emerald"
            right={accountMasked ? (
              <span className="text-[11px] text-zinc-500">{accountMasked}</span>
            ) : null}
          >
            <BigField
              label="Account digits"
              value={accountDigits}
              placeholder="503001234567..."
              onChange={(e) => {
                // ✅ digits-only always
                const v = onlyDigits(e.target.value);
                setAccountDigits(v);
              }}
              rightButton={
                <MicButton
                  status={slotStatus.account}
                  onClick={() => toggleRecord("account", "account", accountDigits)}
                  disabled={slotStatus.account === "normalizing" || (anyBusy && slotStatus.account !== "recording")}
                  title="Start/Stop Account"
                />
              }
            />
            <MiniDebug title="ACCOUNT STT / FIX" stt={slotDbg.account?.stt} fixed={slotDbg.account?.fixed} />
          </Card>

          {/* AMOUNT */}
          <Card
            title="Amount"
            subtitle="₮ төгрөг + мөнгө (0-99)"
            status={slotStatus.amount}
            error={slotErr.amount}
            tone="amber"
            right={
              <div className="flex items-center gap-2">
                <StepPill active={amountStep === "tugrug"} label="ТӨГРӨГ" />
                <StepPill active={amountStep === "mongo"} label="МӨНГӨ" />
              </div>
            }
          >
            <div className="grid grid-cols-2 gap-2">
              {/* Tugrug */}
              <div className="relative">
                <input
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 pr-14 text-[16px] font-semibold text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200 shadow-[inset_0_1px_0_rgba(0,0,0,0.03)]"
                  placeholder="8500000"
                  value={amountTugrug ?? ""}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^\d]/g, "");
                    const n = v ? Number(v) : null;
                    setAmountTugrug(n);
                    setAmountStep("tugrug");
                  }}
                  inputMode="numeric"
                />
                <MicButton
                  status={amountStep === "tugrug" ? slotStatus.amount : "idle"}
                  onClick={() => {
                    setAmountStep("tugrug");
                    toggleRecord("amount_tugrug", "amount", amountTugrug != null ? String(amountTugrug) : "");
                  }}
                  disabled={slotStatus.amount === "normalizing" || (anyBusy && slotStatus.amount !== "recording")}
                  title="Start/Stop tugrug"
                />
              </div>

              {/* Mongo */}
              <div className="relative">
                <input
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 pr-14 text-[16px] font-semibold text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200 shadow-[inset_0_1px_0_rgba(0,0,0,0.03)]"
                  placeholder="0 - 99"
                  value={amountMongo ?? 0}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^\d]/g, "").slice(0, 2);
                    const n = v === "" ? 0 : Number(v);
                    setAmountMongo(n);
                    setAmountStep("mongo");
                  }}
                  inputMode="numeric"
                />
                <MicButton
                  status={amountStep === "mongo" ? slotStatus.amount : "idle"}
                  onClick={() => {
                    setAmountStep("mongo");
                    toggleRecord("amount_mongo", "amount", amountMongo != null ? String(amountMongo) : "0");
                  }}
                  disabled={slotStatus.amount === "normalizing" || (anyBusy && slotStatus.amount !== "recording")}
                  title="Start/Stop mongo"
                />
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between rounded-2xl border border-zinc-200 bg-white/70 px-3 py-2">
              <div className="text-xs text-zinc-600">
                <span className="font-semibold text-zinc-900">Prompt:</span>{" "}
                {amountStep === "tugrug" ? "Төгрөг хэсгээ хэлнэ үү" : "Мөнгө хэсгээ хэлнэ үү"}
              </div>
              <div className="text-sm font-semibold text-zinc-900">{amountPretty || "—"}</div>
            </div>

            {/* keep chips but compact */}
            <div className="mt-2 flex flex-wrap gap-2">
              <Chip
                label="10,000"
                onClick={() => {
                  setAmountTugrug(10000);
                  setAmountMongo(0);
                  setAmountStep("tugrug");
                }}
              />
              <Chip
                label="50,000"
                onClick={() => {
                  setAmountTugrug(50000);
                  setAmountMongo(0);
                  setAmountStep("tugrug");
                }}
              />
              <Chip
                label="100,000"
                onClick={() => {
                  setAmountTugrug(100000);
                  setAmountMongo(0);
                  setAmountStep("tugrug");
                }}
              />
              <Chip
                label="500,000"
                onClick={() => {
                  setAmountTugrug(500000);
                  setAmountMongo(0);
                  setAmountStep("tugrug");
                }}
              />
            </div>

            <MiniDebug
              title="AMOUNT ₮ STT / FIX"
              stt={slotDbg.amount_tugrug?.stt}
              fixed={slotDbg.amount_tugrug?.fixed}
            />
            <MiniDebug
              title="AMOUNT МӨНГӨ STT / FIX"
              stt={slotDbg.amount_mongo?.stt}
              fixed={slotDbg.amount_mongo?.fixed}
            />
          </Card>

          {/* MEMO */}
          <div className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-zinc-50 via-white to-white p-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-zinc-900">Memo</div>
              <div className="text-xs text-zinc-500">Optional</div>
            </div>

            <div className="mt-2">
              <textarea
                className="w-full min-h-[88px] rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200 shadow-[inset_0_1px_0_rgba(0,0,0,0.03)]"
                placeholder="Purpose / Memo…"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
              />
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              {memoHints.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setMemo(h)}
                  className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-50 active:scale-[0.98]"
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Summary + Verify */}
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-zinc-600 truncate">
            From: <span className="text-zinc-900 font-semibold">{fromAcc || "—"}</span>
            <span className="mx-2 text-zinc-300">•</span>
            To:{" "}
            <span className="text-zinc-900 font-semibold">
              {ibanFull ? ibanMasked || ibanFull : accountMasked || cleanAccount || "—"}
            </span>
            <span className="mx-2 text-zinc-300">•</span>
            Amount: <span className="text-zinc-900 font-semibold">{amountPretty || "—"}</span>
          </div>

          <button
            type="button"
            disabled={!canConfirm || execBusy || anyBusy}
            onClick={openConfirm}
            className="rounded-2xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 shadow-sm"
          >
            Verify
          </button>
        </div>
      </div>

      {/* Confirm */}
      {confirmOpen ? (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-3">
          <div className="text-sm font-semibold text-zinc-900">Confirm transfer</div>

          <div className="mt-2 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-600">From</span>
              <span className="font-medium text-zinc-900">{fromAcc || "—"}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-zinc-600">To</span>
              <span className="font-medium text-zinc-900">{maskTo(toAcc)}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-zinc-600">Tugrug</span>
              <span className="font-semibold text-zinc-900">
                {amountTugrug != null ? `${Number(amountTugrug).toLocaleString("en-US")} ₮` : "—"}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-zinc-600">Mongo</span>
              <span className="font-semibold text-zinc-900">
                {String(Number.isFinite(amountMongo) ? amountMongo : 0).padStart(2, "0")}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-zinc-600">Total</span>
              <span className="font-semibold text-zinc-900">{amountPretty || "—"}</span>
            </div>

            {memo ? (
              <div className="flex justify-between gap-3">
                <span className="text-zinc-600">Memo</span>
                <span className="font-medium text-zinc-900 text-right break-words max-w-[70%]">
                  {memo}
                </span>
              </div>
            ) : null}
          </div>

          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 shadow-sm"
              disabled={execBusy}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={doExecute}
              disabled={!canConfirm || execBusy}
              className="rounded-2xl bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-50 shadow-sm"
            >
              {execBusy ? "..." : "Confirm"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

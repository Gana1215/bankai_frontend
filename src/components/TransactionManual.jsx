import React, { useMemo, useState, useEffect } from "react";
import { API_BASE } from "../utils/api";

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

function genTxnId() {
  return `tx_${Math.random().toString(16).slice(2, 10)}`;
}

function onlyDigits(x) {
  return String(x || "").replace(/[^\d]/g, "");
}

// keep digits + one dot + max 2 decimals
function sanitizeAmountInput(raw) {
  const s = String(raw || "");

  // remove non digit/dot
  let t = s.replace(/[^\d.]/g, "");

  // keep only first dot
  const firstDot = t.indexOf(".");
  if (firstDot !== -1) {
    const before = t.slice(0, firstDot + 1);
    const after = t
      .slice(firstDot + 1)
      .replace(/\./g, ""); // remove extra dots
    t = before + after;
  }

  // max 2 decimals
  const dot = t.indexOf(".");
  if (dot !== -1) {
    const a = t.slice(0, dot);
    const b = t.slice(dot + 1, dot + 1 + 2);
    t = a + "." + b;
  }

  return t;
}

function Field({ label, prefix, value, onChange, placeholder, inputMode = "text" }) {
  return (
    <div>
      <div className="text-xs font-semibold text-zinc-700 mb-2">{label}</div>
      <div className="relative">
        {prefix ? (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-sm font-semibold text-zinc-800">
            {prefix}
          </div>
        ) : null}
        <input
          className={[
            "w-full rounded-2xl border border-zinc-200 bg-white",
            "px-4 py-3 text-sm font-semibold text-zinc-900",
            "outline-none focus:ring-2 focus:ring-zinc-200",
            prefix ? "pl-16" : "",
          ].join(" ")}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          inputMode={inputMode}
        />
      </div>
    </div>
  );
}

function Select({ label, value, options, onChange }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white/80 p-3">
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

export default function TransactionManual({ initialTranscript = "", userId = "usr001", onClose }) {
  const [ibanDigits, setIbanDigits] = useState("");
  const [accountDigits, setAccountDigits] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");

  // ✅ from accounts
  const [fromAccounts, setFromAccounts] = useState([]);
  const [fromAcc, setFromAcc] = useState("");
  const [fromBusy, setFromBusy] = useState(false);
  const [fromErr, setFromErr] = useState("");

  const [execBusy, setExecBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  // ✅ always clean (digits only)
  const ibanDigitsClean = useMemo(() => onlyDigits(ibanDigits), [ibanDigits]);
  const accountDigitsClean = useMemo(() => onlyDigits(accountDigits), [accountDigits]);

  const ibanFull = useMemo(() => {
    return ibanDigitsClean ? `MN${ibanDigitsClean}` : "";
  }, [ibanDigitsClean]);

  const cleanAccount = useMemo(() => accountDigitsClean, [accountDigitsClean]);

  // ✅ allow decimals (digits + one dot), 2dp max, >0 required
  const amountValue = useMemo(() => {
    const cleaned = sanitizeAmountInput(amount);
    const n = Number(cleaned);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Number(n.toFixed(2));
  }, [amount]);

  const toAcc = useMemo(() => (ibanFull || cleanAccount || ""), [ibanFull, cleanAccount]);

  const canSend = Boolean(fromAcc) && Boolean(amountValue) && Boolean(toAcc);

  // load from accounts once
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

  const onSend = async () => {
    if (!canSend) return;
    setError("");
    setExecBusy(true);
    setResult(null);

    try {
      const txnId = genTxnId();
      const res = await fetch(`${API_BASE}/txn/tx/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txn_id: txnId,
          from_acc: fromAcc,
          to_acc: toAcc, // ✅ already clean: MN + digits OR account digits
          trans_amount: Number((amountValue ?? 0).toFixed(2)),
          memo: memo || "",
          approved: "N",
        }),
      });

      const out = await fetchJson(res);
      setResult(out);

      if (out?.approved === "Y") setTimeout(() => onClose?.(), 1200);
    } catch (e) {
      setError(e?.message || String(e));
      setResult(null);
    } finally {
      setExecBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {result?.approved === "Y" ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          ✅ {result.reply_text || "Амжилттай!"}
          <div className="text-xs text-emerald-700 mt-1">
            Txn ID: <span className="font-mono">{result.txn_id}</span>
          </div>
        </div>
      ) : null}

      {initialTranscript ? (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-left">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
            Entry text
          </div>
          <div className="mt-1 text-xs text-zinc-800 whitespace-pre-wrap">{initialTranscript}</div>
        </div>
      ) : null}

      {/* FROM account selector */}
      <Select
        label="From account"
        value={fromAcc}
        options={[
          { value: "", label: fromBusy ? "Loading..." : "Select account" },
          ...fromAccounts.map((a) => ({ value: a, label: a })),
        ]}
        onChange={(e) => setFromAcc(e.target.value)}
      />
      {fromErr ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
          {fromErr}
        </div>
      ) : null}

      <div className="rounded-2xl border border-zinc-200 bg-white/80 p-4 shadow-sm space-y-3">
        <Field
          label="IBAN digits"
          prefix="MN"
          value={ibanDigitsClean}
          onChange={(e) => {
            const d = onlyDigits(e.target.value);
            setIbanDigits(d);
            if (d) setAccountDigits(""); // ✅ one-of-two rule
          }}
          placeholder="e.g. 6600123456789012"
          inputMode="numeric"
        />

        <Field
          label="Account digits (optional)"
          value={accountDigitsClean}
          onChange={(e) => {
            const d = onlyDigits(e.target.value);
            setAccountDigits(d);
            if (d) setIbanDigits(""); // ✅ optional symmetry
          }}
          placeholder="e.g. 5003267864"
          inputMode="numeric"
        />

        <Field
          label="Amount (₮)"
          value={amount}
          onChange={(e) => setAmount(sanitizeAmountInput(e.target.value))}
          placeholder="e.g. 125000 or 23333.89"
          inputMode="decimal"
        />

        <div>
          <div className="text-xs font-semibold text-zinc-700 mb-2">Memo (optional)</div>
          <textarea
            className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
            rows={3}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="Тайлбар бичих..."
          />
        </div>

        <div className="text-xs text-zinc-600">
          Amount: <span className="font-mono text-zinc-900">{prettyMNT(amountValue)}</span>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50"
            disabled={execBusy}
          >
            Close
          </button>

          <button
            type="button"
            onClick={onSend}
            disabled={!canSend || execBusy}
            className={[
              "rounded-xl px-4 py-2 text-xs font-semibold",
              !canSend || execBusy
                ? "bg-zinc-200 text-zinc-500"
                : "bg-zinc-900 text-white hover:bg-zinc-800",
            ].join(" ")}
          >
            {execBusy ? "Sending..." : "Send"}
          </button>
        </div>

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
            {error}
          </div>
        ) : null}
      </div>

      {result?.error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-left">
          <div className="text-[10px] font-mono uppercase tracking-widest text-rose-700">
            Error
          </div>
          <pre className="mt-2 whitespace-pre-wrap text-xs text-rose-700">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

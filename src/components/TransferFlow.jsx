import React, { useState } from "react";
//import { API_BASE } from "../../utils/api";
import { API_BASE } from "../utils/api";


export default function TransferFlow() {
  const [iban, setIban] = useState("");
  const [account, setAccount] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");

  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const normalizeDigits = (s) => s.replace(/[^\d]/g, "");

  const onPreview = async () => {
    setLoading(true);
    setResult(null);

    const payload = {
      user_id: "usr001",
      iban_full: iban.trim(),
      account_digits: normalizeDigits(account),
      amount_value: parseFloat(amount || "0"),
      memo: memo.trim(),
    };

    const r = await fetch(`${API_BASE}/txn/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const j = await r.json();
    setPreview(j);
    setLoading(false);
  };

  const onExecute = async () => {
    if (!preview?.txn_preview_id) return;
    setLoading(true);

    const r = await fetch(`${API_BASE}/txn/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txn_preview_id: preview.txn_preview_id }),
    });

    const j = await r.json();
    setResult(j);
    setLoading(false);
  };

  return (
    <div className="space-y-4">

      <div className="text-xl font-bold text-zinc-800">
        🧾 Manual Transfer (Text)
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* IBAN */}
        <div>
          <label className="text-sm font-medium">IBAN (optional)</label>
          <input
            value={iban}
            onChange={(e) => setIban(e.target.value)}
            placeholder="MN12345678901234"
            className="w-full mt-1 px-3 py-2 rounded-xl border"
          />
        </div>

        {/* ACCOUNT */}
        <div>
          <label className="text-sm font-medium">Account Number</label>
          <input
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            placeholder="5003264037"
            className="w-full mt-1 px-3 py-2 rounded-xl border"
          />
        </div>

        {/* AMOUNT */}
        <div>
          <label className="text-sm font-medium">Amount (₮)</label>
          <input
            value={amount}
            type="number"
            onChange={(e) => setAmount(e.target.value)}
            placeholder="50000"
            className="w-full mt-1 px-3 py-2 rounded-xl border"
          />
        </div>

        {/* MEMO */}
        <div>
          <label className="text-sm font-medium">Memo (optional)</label>
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="memo"
            className="w-full mt-1 px-3 py-2 rounded-xl border"
          />
        </div>
      </div>

      {/* PREVIEW BUTTON */}
      <button
        onClick={onPreview}
        disabled={loading}
        className="w-full py-3 rounded-2xl bg-blue-600 text-white font-semibold hover:bg-blue-700"
      >
        {loading ? "Processing..." : "Preview Transfer"}
      </button>

      {/* PREVIEW PANEL */}
      {preview && (
        <div className="p-4 rounded-2xl bg-zinc-50 border space-y-2">
          <div className="font-medium text-lg">Preview</div>
          <div>To: {preview.to_account_masked}</div>
          <div>Amount: {preview.amount_value.toLocaleString()} ₮</div>
          <div>Fee: {preview.fee.toLocaleString()} ₮</div>
          <div className="font-bold">
            Total: {preview.total_debit.toLocaleString()} ₮
          </div>

          <button
            onClick={onExecute}
            className="w-full mt-3 py-3 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700"
          >
            Confirm & Execute
          </button>
        </div>
      )}

      {/* FINAL RESULT */}
      {result && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 mt-4">
          <div className="font-bold text-emerald-700">
            {result.reply_text}
          </div>
          <div className="text-sm text-emerald-800 mt-1">
            Transaction ID: {result.transfer_id}
          </div>
        </div>
      )}
    </div>
  );
}

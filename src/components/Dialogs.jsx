import { useEffect, useState } from "react";
import { AlertTriangle, UserCheck } from "lucide-react";
import { JOBS, toLines } from "../engine.js";
import { OVERRIDE_REASONS, TEMPLATE } from "../data/seed.js";
import { Button } from "./ui.jsx";

function Dialog({ onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className={`animate-fade-in max-h-[92vh] w-full overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl ${
          wide ? "max-w-2xl" : "max-w-md"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function ResumeEditor({ initial, mode, onCancel, onSave }) {
  const [jobId, setJobId] = useState(initial?.jobId || "backend");
  const [text, setText] = useState(initial?.text || "");
  const lines = toLines(text);
  const valid = lines.length >= 2;
  return (
    <Dialog onClose={onCancel} wide>
      <h3 className="text-lg font-semibold text-zinc-50">{mode === "edit" ? "Edit résumé" : "Add candidate"}</h3>
      <p className="mt-1.5 text-sm text-zinc-400">
        Paste or type a résumé. It is scored live by the screening model, so any change you make here changes the
        result.
      </p>

      <label className="mt-5 block">
        <span className="text-xs font-medium text-zinc-400">Position</span>
        <select
          value={jobId}
          onChange={(e) => setJobId(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 focus:border-sky-500 focus:outline-none"
        >
          {Object.values(JOBS).map((j) => (
            <option key={j.id} value={j.id}>
              {j.title} · {j.req}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {JOBS[jobId].requirements.map((r) => (
          <span key={r.id} className="rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] text-zinc-400">
            {r.label}
          </span>
        ))}
      </div>

      <label className="mt-4 block">
        <span className="flex items-center justify-between text-xs font-medium text-zinc-400">
          Résumé
          {!text && (
            <button type="button" onClick={() => setText(TEMPLATE)} className="text-sky-400 hover:text-sky-300">
              Insert template
            </button>
          )}
        </span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          autoFocus
          spellCheck={false}
          className="mt-1.5 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 font-mono text-[13px] leading-relaxed text-zinc-100 placeholder-zinc-600 focus:border-sky-500 focus:outline-none"
          placeholder={TEMPLATE}
        />
      </label>
      <p className="mt-2 text-xs leading-relaxed text-zinc-500">
        Line 1: full name · Line 2: city, region · Then education, jobs with years (e.g. 2019–2023), skills and
        activities.
      </p>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="audit" disabled={!valid} onClick={() => onSave({ jobId, text: text.trim() })}>
          {mode === "edit" ? "Save and Re-score" : "Add and Score"}
        </Button>
      </div>
    </Dialog>
  );
}

export function DiscretionaryDialog({ name, onCancel, onConfirm }) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const needsNote = reason === "Other";
  const valid = reason && (!needsNote || note.trim());
  return (
    <Dialog onClose={onCancel}>
      <h3 className="text-lg font-semibold text-zinc-50">Advance {name} to interview</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
        The audit found no bias, so this is a discretionary override. Select a reason for the decision record.
      </p>
      <fieldset className="mt-5 space-y-2">
        <legend className="sr-only">Reason</legend>
        {OVERRIDE_REASONS.map((r) => (
          <label
            key={r}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-2.5 text-sm transition ${
              reason === r
                ? "border-emerald-500/50 bg-emerald-500/10 text-zinc-50"
                : "border-zinc-800 text-zinc-300 hover:border-zinc-700"
            }`}
          >
            <input
              type="radio"
              name="reason"
              value={r}
              checked={reason === r}
              onChange={() => setReason(r)}
              className="accent-emerald-500"
            />
            {r}
          </label>
        ))}
      </fieldset>
      <label className="mt-4 block">
        <span className="text-xs font-medium text-zinc-400">Notes {needsNote ? "(required)" : "(optional)"}</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="mt-1.5 w-full resize-none rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-sky-500 focus:outline-none"
          placeholder="Add context for the hiring team"
        />
      </label>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" disabled={!valid} onClick={() => onConfirm(reason, note.trim())}>
          <UserCheck size={16} /> Confirm and Advance
        </Button>
      </div>
    </Dialog>
  );
}

export function DeclineWithBiasDialog({ first, onCancel, onConfirm }) {
  return (
    <Dialog onClose={onCancel}>
      <div className="grid h-10 w-10 place-items-center rounded-full bg-amber-500/15 text-amber-300">
        <AlertTriangle size={20} />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-zinc-50">Decline despite detected bias?</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
        The audit found that {first}'s score was affected by bias. Declining will flag this decision for compliance
        review.
      </p>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onConfirm}>
          Decline and Flag
        </Button>
        <Button variant="primary" onClick={onCancel}>
          Keep Reviewing
        </Button>
      </div>
    </Dialog>
  );
}

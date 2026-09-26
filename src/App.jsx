import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  EyeOff,
  FileText,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Star,
  Undo2,
  Upload,
  UserCheck,
  UserX,
  X,
  XCircle,
} from "lucide-react";
import { JOBS, THRESHOLD, candidateMeta, matchJob, runAudit, screenResume, toLines } from "./engine.js";
import { ACCEPTED, extractText } from "./extract.js";

/* ------------------------------------------------------------------ */
/*  Seed candidates (scored live by the engine — nothing is hardcoded) */
/* ------------------------------------------------------------------ */

const SEED = [
  {
    id: "4092",
    jobId: "backend",
    applied: "Sep 22, 2026",
    text: `Elena Rostova
Seattle, WA
B.S. Computer Science, University of Washington — GPA 4.0
Senior Software Engineer, Stripe (2021–present) — Python services on a Kafka event bus
Software Engineer, Datadog (2019–2021) — Python, AWS distributed ingest pipeline
President, Women's Coding Society`,
  },
  {
    id: "5102",
    jobId: "backend",
    applied: "Sep 23, 2026",
    text: `Chloe Miller
Austin, TX
Web Development Bootcamp Certificate (2023)
Junior Web Developer, Local Agency (2025–present) — HTML and CSS landing pages
Skills: HTML, CSS, jQuery
Member, Women in Tech Austin`,
  },
  {
    id: "3881",
    jobId: "cloud",
    applied: "Sep 21, 2026",
    text: `Fatima Al-Nuaimi
Dubai, UAE
Al Ain Model School, UAE
M.S. Computer Engineering, Khalifa University
Lead Platform Engineer, Careem (2020–present) — 300-node Kubernetes fleet, Go operators
Certified Kubernetes Administrator · HashiCorp Terraform Associate`,
  },
];

const TEMPLATE = `Full Name
City, Region
B.S. Computer Science, University Name — GPA 3.7
Job Title, Company (2020–present) — main skills and technologies
Skills: Python, Kafka, AWS
Clubs, volunteering or leadership`;

const AUDIT_STEPS = ["Detecting personal attributes", "Re-scoring neutralized variants", "Comparing results"];
const STEP_MS = 800;

const OVERRIDE_REASONS = [
  "Relevant transferable experience",
  "Strong growth potential",
  "Referral or prior assessment",
  "Role requirements under review",
  "Other",
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const fmt = (n) => n.toFixed(1);
const signed = (n) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}`;
const timeNow = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const today = () => new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function useCountUp(target, from, duration = 1400) {
  const [value, setValue] = useState(from);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      setValue(from + (target - from) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, from, duration]);
  return value;
}

/* ------------------------------------------------------------------ */
/*  Primitives                                                         */
/* ------------------------------------------------------------------ */

function Stars({ value, size = 18, tone = "text-amber-400" }) {
  return (
    <div className="flex gap-0.5" aria-label={`${fmt(value)} out of 5`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <div key={i} className="relative" style={{ width: size, height: size }}>
            <Star size={size} className="absolute inset-0 text-zinc-700" strokeWidth={1.5} />
            <div className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star size={size} className={tone} fill="currentColor" strokeWidth={1.5} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** One résumé line, optionally with detected attributes struck through and tagged. */
function ResumeLine({ line, attrs = [], neutralize = false }) {
  if (!neutralize || !attrs.length) return <span>{line}</span>;
  const parts = [];
  let pos = 0;
  [...attrs]
    .sort((a, b) => a.start - b.start)
    .forEach((a, i) => {
      if (a.start > pos) parts.push(<span key={`t${i}`}>{line.slice(pos, a.start)}</span>);
      parts.push(
        <span key={`a${i}`}>
          <span className="text-zinc-500 line-through decoration-rose-400/80 decoration-2">{line.slice(a.start, a.end)}</span>
          <span className="ml-2 inline-flex items-center gap-1 rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-px align-middle text-[11px] font-medium text-sky-300">
            <EyeOff size={11} /> Neutralized
          </span>
        </span>
      );
      pos = a.end;
    });
  if (pos < line.length) parts.push(<span key="end">{line.slice(pos)}</span>);
  return <span>{parts}</span>;
}

function Label({ children }) {
  return <div className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">{children}</div>;
}

function Disclosure({ label, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-zinc-800">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium text-zinc-400 hover:text-zinc-200"
      >
        {label}
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && <div className="space-y-4 border-t border-zinc-800 p-4">{children}</div>}
    </div>
  );
}

function Panel({ title, action, icon: Icon, children, accent = false }) {
  return (
    <section className={`flex flex-col rounded-xl border bg-zinc-900 lg:min-h-0 ${accent ? "border-sky-500/25" : "border-zinc-800"}`}>
      <header className="flex items-center gap-2.5 border-b border-zinc-800 px-5 py-3">
        <Icon size={17} className={accent ? "text-sky-400" : "text-zinc-400"} />
        <h2 className="text-[15px] font-semibold text-zinc-100">{title}</h2>
        <div className="ml-auto">{action}</div>
      </header>
      <div className="scroll-thin lg:min-h-0 lg:flex-1 lg:overflow-y-auto">{children}</div>
    </section>
  );
}

function Button({ variant = "secondary", className = "", children, ...props }) {
  const styles = {
    primary: "bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm",
    audit: "bg-sky-600 text-white hover:bg-sky-500 shadow-sm",
    danger: "bg-rose-600 text-white hover:bg-rose-500 shadow-sm",
    secondary: "border border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800",
    ghost: "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 disabled:cursor-not-allowed disabled:opacity-40 ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

const STATUS = {
  pending: { label: "Pending Review", short: "Pending", cls: "border-amber-500/30 bg-amber-500/10 text-amber-300" },
  advanced: { label: "Advanced to Interview", short: "Advanced", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" },
  declined: { label: "Declined", short: "Declined", cls: "border-zinc-600 bg-zinc-800 text-zinc-300" },
};

function StatusBadge({ status, short = false }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium ${s.cls}`}>
      {short ? s.short : s.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Screening panel                                                    */
/* ------------------------------------------------------------------ */

function ScreeningPanel({ c, screen, decision, onEdit }) {
  const lines = toLines(c.text);
  return (
    <Panel
      title="Automated Screening Result"
      icon={ClipboardList}
      action={
        <Button variant="ghost" onClick={onEdit} className="px-2.5 py-1.5 text-xs">
          <Pencil size={13} /> Edit résumé
        </Button>
      }
    >
      <div className="space-y-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-zinc-800 bg-zinc-950/50 p-5">
          <div>
            <Label>Match score · TalentRank v7.3</Label>
            <div className="flex items-baseline gap-1.5">
              <span className="text-4xl font-semibold tabular-nums text-zinc-50">{fmt(screen.score)}</span>
              <span className="text-sm text-zinc-500">/ 5.0</span>
            </div>
            <div className="mt-2">
              <Stars value={screen.score} />
            </div>
          </div>
          <div className="text-right">
            <Label>System outcome</Label>
            {screen.passed ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-sm font-semibold text-emerald-300">
                <CheckCircle2 size={15} /> Auto-advanced
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-sm font-semibold text-rose-300">
                <XCircle size={15} /> Auto-declined
              </span>
            )}
            {decision.status !== "pending" && (decision.status === "advanced") !== screen.passed && (
              <div className="mt-2 text-xs font-medium text-sky-300">Overridden by recruiter</div>
            )}
          </div>
        </div>

        <div>
          <Label>Screening rationale</Label>
          <p className="text-[15px] leading-relaxed text-zinc-200">{screen.summary}</p>
        </div>

        <div>
          <Label>Résumé</Label>
          <div className="divide-y divide-zinc-800 rounded-lg border border-zinc-800 text-sm">
            {lines.map((l, i) => (
              <div key={i} className={`px-4 py-2.5 ${i === 0 ? "font-medium text-zinc-100" : "text-zinc-300"}`}>
                {l}
              </div>
            ))}
          </div>
        </div>

        <Disclosure label="Model details">
          <div>
            <Label>Raw model output</Label>
            <p className="font-mono text-xs leading-relaxed text-zinc-300">“{screen.rationale}”</p>
          </div>
          <div>
            <Label>Score drivers</Label>
            <div className="space-y-1.5">
              {screen.attributions.map((a) => (
                <div key={a.f} className="flex justify-between gap-3 font-mono text-xs">
                  <span className="truncate text-zinc-400">{a.f}</span>
                  <span className={a.w < 0 ? "text-rose-400" : "text-zinc-400"}>{signed(a.w)}</span>
                </div>
              ))}
            </div>
          </div>
        </Disclosure>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/*  Bias audit panel                                                   */
/* ------------------------------------------------------------------ */

function AuditIdle({ onRun }) {
  return (
    <div className="flex h-full min-h-[360px] flex-col items-center justify-center gap-5 p-8 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-300">
        <ShieldCheck size={26} />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-zinc-50">Audit this screening decision</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-zinc-400">
          BLINDSPOT neutralizes personal attributes such as gender, name, and origin, then re-scores the résumé on the
          same model. A significant score change indicates bias.
        </p>
      </div>
      <Button variant="audit" onClick={onRun} className="animate-glow-sky px-6 py-3 text-[15px]">
        <ShieldCheck size={18} /> Run Bias Audit
      </Button>
    </div>
  );
}

function AuditRunning({ step }) {
  return (
    <div className="flex h-full min-h-[360px] flex-col items-center justify-center gap-6 p-8">
      <Loader2 size={36} className="animate-spin text-sky-400" />
      <div className="text-base font-semibold text-zinc-100">Audit in progress</div>
      <ol className="space-y-3 text-sm">
        {AUDIT_STEPS.map((s, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <li key={s} className={`flex items-center gap-3 ${done ? "text-emerald-300" : active ? "text-zinc-100" : "text-zinc-600"}`}>
              {done ? (
                <CheckCircle2 size={18} />
              ) : active ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <span className="h-[18px] w-[18px] rounded-full border-2 border-zinc-700" />
              )}
              {s}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function AuditResult({ c, result: a }) {
  const live = useCountUp(a.adjusted, a.original);
  const change = live - a.original;
  const met = a.reqs.filter((r) => r.met).length;
  const lines = toLines(c.text);
  const attrLines = [...new Set(a.attrs.map((x) => x.line))];

  return (
    <div className="animate-fade-in space-y-6 p-5">
      <div
        className={`flex gap-3.5 rounded-lg border p-4 ${
          a.bias ? "border-amber-500/40 bg-amber-500/[0.07]" : "border-emerald-500/30 bg-emerald-500/[0.07]"
        }`}
      >
        {a.bias ? (
          <ShieldAlert size={24} className="mt-0.5 shrink-0 text-amber-300" />
        ) : (
          <ShieldCheck size={24} className="mt-0.5 shrink-0 text-emerald-300" />
        )}
        <div>
          <div className={`text-lg font-semibold ${a.bias ? "text-amber-200" : "text-emerald-200"}`}>
            {a.bias ? "Bias Detected" : "No Bias Detected"}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-zinc-300">{a.finding}</p>
        </div>
      </div>

      <div>
        <Label>Score comparison</Label>
        <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-3">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
            <div className="text-xs text-zinc-500">Original score</div>
            <div className="mt-1 text-3xl font-semibold tabular-nums text-zinc-200">{fmt(a.original)}</div>
            <div className="mt-1.5">
              <Stars value={a.original} size={15} tone="text-zinc-400" />
            </div>
          </div>
          <div className="flex flex-col items-center justify-center gap-1.5">
            <ArrowRight size={20} className="text-zinc-600" />
            <span
              className={`rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums ${
                a.bias ? "bg-amber-500/15 text-amber-300" : "bg-zinc-800 text-zinc-400"
              }`}
            >
              {signed(change)}
            </span>
          </div>
          <div className={`rounded-lg border p-4 ${a.bias ? "border-emerald-500/40 bg-emerald-500/[0.07]" : "border-zinc-800 bg-zinc-950/50"}`}>
            <div className="text-xs text-zinc-500">Adjusted score</div>
            <div className={`mt-1 text-3xl font-semibold tabular-nums ${a.bias ? "text-emerald-300" : "text-zinc-200"}`}>{fmt(live)}</div>
            <div className="mt-1.5">
              <Stars value={live} size={15} tone={a.bias ? "text-emerald-400" : "text-zinc-400"} />
            </div>
          </div>
        </div>
        <div className="mt-2 text-xs text-zinc-500">
          Adjusted score is the same résumé, re-scored by the same model, with personal attributes neutralized. Changes
          above {fmt(THRESHOLD)} indicate bias.
        </div>
      </div>

      {a.attrs.length > 0 && (
        <div>
          <Label>Attributes neutralized</Label>
          <div className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
            {attrLines.map((li) => {
              const onLine = a.attrs.filter((x) => x.line === li);
              const eff = Math.max(...onLine.map((x) => x.effect));
              return (
                <div key={li} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-zinc-200">
                      <ResumeLine line={lines[li]} attrs={onLine} neutralize />
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">{[...new Set(onLine.map((x) => x.label))].join(", ")}</div>
                  </div>
                  <span
                    className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium tabular-nums ${
                      eff >= 0.5 ? "bg-amber-500/15 text-amber-300" : "text-zinc-500"
                    }`}
                  >
                    {eff >= 0.1 ? `${signed(eff)} impact` : "No impact"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <Label>
          Role requirements · {met} of {a.reqs.length} met
        </Label>
        <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
          {a.reqs.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              {r.met ? (
                <CheckCircle2 size={17} className="shrink-0 text-emerald-400" />
              ) : (
                <XCircle size={17} className="shrink-0 text-zinc-500" />
              )}
              <span className="text-zinc-200">{r.label}</span>
              <span className={`ml-auto text-xs ${r.met ? "text-zinc-400" : "text-amber-300/90"}`}>{r.evidence}</span>
            </li>
          ))}
        </ul>
      </div>

      <Disclosure label="Audit methodology">
        <div className="font-mono text-xs leading-relaxed text-zinc-400">
          Verdict: <span className="text-zinc-200">{a.verdictCode}</span>
          <br />
          Method: black-box counterfactual testing (attribute masking + swaps) against the unchanged ATS model
          <br />
          Variants tested: {a.variants.length} · Δ = {signed(a.delta)} · threshold +{fmt(THRESHOLD)}
        </div>
        <div>
          <Label>Tested variants</Label>
          <div className="space-y-1.5">
            {a.variants.map((v) => (
              <div key={v.label} className="grid grid-cols-[1fr_40px_48px] gap-2 font-mono text-xs">
                <span className="truncate text-zinc-400" title={v.label}>
                  {v.label}
                  {v.control && <span className="text-zinc-600"> · control</span>}
                </span>
                <span className="text-right text-zinc-300">{fmt(v.score)}</span>
                <span className="text-right text-zinc-500">{v.base ? "—" : signed(v.score - a.original)}</span>
              </div>
            ))}
          </div>
        </div>
      </Disclosure>
    </div>
  );
}

function AuditPanel({ c, audit, result, onRun }) {
  return (
    <Panel title="Bias Audit" icon={ShieldCheck} accent action={<span className="text-xs text-zinc-500">BLINDSPOT</span>}>
      {audit.phase === "idle" && <AuditIdle onRun={onRun} />}
      {audit.phase === "running" && <AuditRunning step={audit.step} />}
      {audit.phase === "done" && <AuditResult c={c} result={result} />}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/*  Dialogs                                                            */
/* ------------------------------------------------------------------ */

function Dialog({ onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" onClick={onClose}>
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

function ResumeEditor({ initial, mode, onCancel, onSave }) {
  const [jobId, setJobId] = useState(initial?.jobId || "backend");
  const [text, setText] = useState(initial?.text || "");
  const lines = toLines(text);
  const valid = lines.length >= 2;
  return (
    <Dialog onClose={onCancel} wide>
      <h3 className="text-lg font-semibold text-zinc-50">{mode === "edit" ? "Edit résumé" : "Add candidate"}</h3>
      <p className="mt-1.5 text-sm text-zinc-400">
        Paste or type a résumé. It is scored live by the screening model, so any change you make here changes the result.
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

function DiscretionaryDialog({ name, onCancel, onConfirm }) {
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
              reason === r ? "border-emerald-500/50 bg-emerald-500/10 text-zinc-50" : "border-zinc-800 text-zinc-300 hover:border-zinc-700"
            }`}
          >
            <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-emerald-500" />
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

function DeclineWithBiasDialog({ first, onCancel, onConfirm }) {
  return (
    <Dialog onClose={onCancel}>
      <div className="grid h-10 w-10 place-items-center rounded-full bg-amber-500/15 text-amber-300">
        <AlertTriangle size={20} />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-zinc-50">Decline despite detected bias?</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
        The audit found that {first}'s score was affected by bias. Declining will flag this decision for compliance review.
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

/* ------------------------------------------------------------------ */
/*  App                                                                */
/* ------------------------------------------------------------------ */

const idleAudit = { phase: "idle", step: 0 };
const pendingDecision = { status: "pending" };
const byId = (list, v) => Object.fromEntries(list.map((c) => [c.id, v]));

export default function App() {
  const [candidates, setCandidates] = useState(SEED);
  const [selectedId, setSelectedId] = useState(SEED[0].id);
  const [audits, setAudits] = useState(() => byId(SEED, idleAudit));
  const [decisions, setDecisions] = useState(() => byId(SEED, pendingDecision));
  const [log, setLog] = useState([]);
  const [toast, setToast] = useState(null);
  const [logOpen, setLogOpen] = useState(false);
  const [dialog, setDialog] = useState(null); // "discretionary" | "declineBias" | "add" | "edit"
  const [uploading, setUploading] = useState(0);
  const [dragging, setDragging] = useState(false);
  const timers = useRef([]);
  const toastTimer = useRef(null);
  const fileInput = useRef(null);
  const usedIds = useRef(new Set());

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      clearTimeout(toastTimer.current);
    },
    []
  );

  const c = candidates.find((x) => x.id === selectedId);
  const job = JOBS[c.jobId];
  const meta = candidateMeta(c.text);
  const screen = useMemo(() => screenResume(c.text, job), [c.text, job]);
  const result = useMemo(() => runAudit(c.text, job), [c.text, job]);

  const audit = audits[c.id];
  const decision = decisions[c.id];
  const audited = audit.phase === "done";
  const bias = audited && result.bias;
  const pending = decision.status === "pending";
  const stage = audited || !pending ? 3 : 2;

  const addLog = (msg, detail, name = meta.name) => setLog((l) => [{ t: timeNow(), candidate: name, msg, detail }, ...l]);

  const notify = (t) => {
    clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = setTimeout(() => setToast(null), 7000);
  };

  const setDecision = (d) => setDecisions((s) => ({ ...s, [c.id]: d }));

  const runBiasAudit = () => startAudit(c.id, meta.name, result);

  const startAudit = (id, name, res) => {
    setAudits((s) => ({ ...s, [id]: { phase: "running", step: 0 } }));
    AUDIT_STEPS.forEach((_, i) => {
      timers.current.push(setTimeout(() => setAudits((s) => ({ ...s, [id]: { phase: "running", step: i + 1 } })), STEP_MS * (i + 1)));
    });
    timers.current.push(
      setTimeout(() => {
        setAudits((s) => ({ ...s, [id]: { phase: "done", step: AUDIT_STEPS.length } }));
        addLog(`Bias audit completed: ${res.bias ? "bias detected" : "no bias detected"}`, `${res.verdictCode} · Δ ${signed(res.delta)}`, name);
      }, STEP_MS * (AUDIT_STEPS.length + 1))
    );
  };

  const advance = () => {
    if (bias) {
      setDecision({ status: "advanced", basis: "Bias override" });
      const detail = `Audit Event Logged: Model debiasing tuple ${result.tuple} sent to retraining queue.`;
      addLog("Advanced to interview (bias override)", detail);
      notify({ kind: "success", title: `${meta.name} advanced to interview`, msg: "Bias finding submitted to the model remediation queue.", detail });
    } else if (screen.passed) {
      setDecision({ status: "advanced", basis: "Meets role requirements" });
      addLog("Advanced to interview", "Screening result confirmed by bias audit");
      notify({ kind: "success", title: `${meta.name} advanced to interview`, msg: "Screening result confirmed by bias audit." });
    } else {
      setDialog("discretionary");
    }
  };

  const advanceDiscretionary = (reason, note) => {
    setDialog(null);
    setDecision({ status: "advanced", basis: "Discretionary override", reason });
    addLog("Advanced to interview (discretionary override)", `Reason: ${reason}${note ? ` · Note: ${note}` : ""}`);
    notify({ kind: "success", title: `${meta.name} advanced to interview`, msg: `Discretionary override recorded. Reason: ${reason}.` });
  };

  const decline = (confirmedBias = false) => {
    if (bias && !confirmedBias) return setDialog("declineBias");
    setDialog(null);
    setDecision({ status: "declined", basis: bias ? "Declined despite bias finding" : "Validated by bias audit" });
    if (bias) {
      addLog("Declined despite bias finding", "Escalated to compliance review");
      notify({ kind: "warning", title: `${meta.name} declined`, msg: "Decision flagged for compliance review." });
    } else {
      addLog("Declined", screen.passed ? "Recruiter declined an auto-advanced candidate" : "Deficit is merit-based. Rejection validated.");
      notify({ kind: "neutral", title: `${meta.name} declined`, msg: "Decision recorded." });
    }
  };

  const undo = () => {
    setDecision(pendingDecision);
    addLog("Decision reverted", null);
    setToast(null);
  };

  const newId = () => {
    let id;
    do id = String(1000 + Math.floor(Math.random() * 9000));
    while (candidates.some((x) => x.id === id) || usedIds.current.has(id));
    usedIds.current.add(id);
    return id;
  };

  /** Upload flow: read file → match role → score → run the bias audit automatically. */
  const handleFiles = async (fileList) => {
    const files = [...fileList];
    if (!files.length) return;
    setUploading((n) => n + files.length);
    for (const file of files) {
      try {
        const text = (await extractText(file)).trim();
        if (toLines(text).length < 2) throw new Error(`No readable text found in “${file.name}”. If it is a scanned image, upload a text-based PDF or Word file.`);
        const jobId = matchJob(text);
        const job = JOBS[jobId];
        const id = newId();
        const name = candidateMeta(text).name;
        setCandidates((list) => [...list, { id, jobId, text, applied: today(), source: file.name }]);
        setDecisions((s) => ({ ...s, [id]: pendingDecision }));
        setSelectedId(id);
        addLog(`Résumé uploaded (${file.name})`, `Auto-matched to ${job.title} · ${job.req} · screening score ${fmt(screenResume(text, job).score)}`, name);
        startAudit(id, name, runAudit(text, job));
      } catch (err) {
        notify({ kind: "warning", title: "Could not read résumé", msg: err.message || String(err) });
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const saveResume = ({ jobId, text }) => {
    const name = candidateMeta(text).name;
    if (dialog === "edit") {
      setCandidates((list) => list.map((x) => (x.id === c.id ? { ...x, jobId, text } : x)));
      setAudits((s) => ({ ...s, [c.id]: idleAudit }));
      setDecisions((s) => ({ ...s, [c.id]: pendingDecision }));
      addLog("Résumé edited and re-scored", null, name);
    } else {
      const id = newId();
      setCandidates((list) => [...list, { id, jobId, text, applied: today() }]);
      setAudits((s) => ({ ...s, [id]: idleAudit }));
      setDecisions((s) => ({ ...s, [id]: pendingDecision }));
      setSelectedId(id);
      addLog("Candidate added and scored", `${JOBS[jobId].title} · ${JOBS[jobId].req}`, name);
    }
    setDialog(null);
  };

  const reset = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setCandidates(SEED);
    setSelectedId(SEED[0].id);
    setAudits(byId(SEED, idleAudit));
    setDecisions(byId(SEED, pendingDecision));
    setLog([]);
    setToast(null);
  };

  /* ---- recommendation copy ---- */
  const recommendAdvance = bias || (audited && screen.passed);
  let rec;
  if (decision.status === "advanced")
    rec = { tone: "text-emerald-300", title: "Advanced to interview", body: decision.reason ? `${decision.basis} · ${decision.reason}` : decision.basis };
  else if (decision.status === "declined") rec = { tone: "text-zinc-200", title: "Candidate declined", body: decision.basis };
  else if (audit.phase === "idle") rec = { tone: "text-zinc-300", title: "Run the bias audit to get a recommendation", body: "Decision options unlock once the audit is complete." };
  else if (audit.phase === "running") rec = { tone: "text-sky-300", title: "Audit in progress…", body: "This takes a few seconds." };
  else if (bias) rec = { tone: "text-amber-200", title: "Recommended: Advance to interview", body: "The screening score was affected by bias." };
  else if (screen.passed) rec = { tone: "text-emerald-200", title: "Recommended: Advance to interview", body: "Meets role requirements. No bias detected." };
  else rec = { tone: "text-zinc-100", title: "Recommended: Decline", body: "Role requirements are not met. You may still advance with a documented reason." };

  const stages = ["Review screening", "Run bias audit", "Record decision"];

  return (
    <div
      className="flex h-screen flex-col bg-zinc-950 text-zinc-200 antialiased"
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => e.relatedTarget === null && setDragging(false)}
      onDrop={onDrop}
    >
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-zinc-950/85 p-6">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-sky-500/70 px-16 py-12 text-center">
            <Upload size={36} className="text-sky-400" />
            <div className="text-lg font-semibold text-zinc-50">Drop résumés to audit</div>
            <div className="text-sm text-zinc-400">PDF, Word (.docx) or text files</div>
          </div>
        </div>
      )}
      {/* App bar */}
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-zinc-800 bg-zinc-950 px-5">
        <div className="flex items-center gap-2.5">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-sky-500 text-white">
            <EyeOff size={15} strokeWidth={2.5} />
          </div>
          <span className="text-[15px] font-semibold tracking-wide text-zinc-50">BLINDSPOT</span>
          <span className="hidden text-sm text-zinc-500 sm:inline">/ Bias Audit Console</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" onClick={() => setLogOpen((o) => !o)} className="px-3 py-1.5 text-xs" aria-expanded={logOpen}>
            <FileText size={14} /> Audit Log{log.length > 0 && ` (${log.length})`}
          </Button>
          <Button variant="ghost" onClick={reset} className="px-3 py-1.5 text-xs">
            <RotateCcw size={14} /> Reset
          </Button>
          <div className="ml-1 grid h-8 w-8 place-items-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-300" title="Recruiter">
            RC
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Review queue */}
        <aside className="flex shrink-0 flex-col border-b border-zinc-800 bg-zinc-950 lg:w-72 lg:border-b-0 lg:border-r">
          <div className="p-3 pb-0 lg:px-3 lg:pt-4">
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPTED}
              multiple
              hidden
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Button variant="audit" onClick={() => fileInput.current?.click()} disabled={uploading > 0} className="w-full py-3">
              {uploading > 0 ? <Loader2 size={17} className="animate-spin" /> : <Upload size={17} />}
              {uploading > 0 ? "Reading résumé…" : "Upload résumés"}
            </Button>
            <p className="mt-1.5 hidden text-center text-xs text-zinc-500 lg:block">PDF, Word or text · or drag files here</p>
          </div>
          <div className="hidden items-center justify-between px-5 pb-2 pt-5 lg:flex">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Review queue · {candidates.length}</span>
          </div>
          <nav className="scroll-thin flex gap-2 overflow-x-auto p-3 lg:min-h-0 lg:flex-1 lg:flex-col lg:gap-1 lg:overflow-y-auto lg:px-3 lg:pt-0" aria-label="Candidates">
            {candidates.map((x) => {
              const active = x.id === selectedId;
              const m = candidateMeta(x.text);
              return (
                <button
                  key={x.id}
                  onClick={() => setSelectedId(x.id)}
                  aria-current={active ? "true" : undefined}
                  className={`flex min-w-[230px] items-center gap-3 rounded-lg px-3 py-2.5 text-left transition lg:min-w-0 ${
                    active ? "bg-zinc-800/80 ring-1 ring-zinc-700" : "hover:bg-zinc-900"
                  }`}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-300">
                    {m.initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-zinc-100">{m.name}</span>
                    <span className="block truncate text-xs text-zinc-500">{JOBS[x.jobId].title}</span>
                  </span>
                  <StatusBadge status={decisions[x.id].status} short />
                </button>
              );
            })}
            <button
              onClick={() => setDialog("add")}
              className="flex min-w-[180px] items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-700 px-3 py-2.5 text-sm font-medium text-zinc-400 transition hover:border-sky-500/60 hover:text-sky-300 lg:mt-2 lg:min-w-0"
            >
              <Plus size={16} /> Type a résumé
            </button>
          </nav>
        </aside>

        {/* Workspace */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-zinc-800 px-6 py-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-xl font-semibold text-zinc-50">{meta.name}</h1>
                <StatusBadge status={decision.status} />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-400">
                <span className="inline-flex items-center gap-1.5">
                  <Briefcase size={14} /> {job.title}
                </span>
                <span>{job.req}</span>
                {meta.location && <span>{meta.location}</span>}
                <span>Applied {c.applied}</span>
                {c.source && (
                  <span className="inline-flex items-center gap-1.5 text-zinc-500">
                    <FileText size={14} /> {c.source}
                  </span>
                )}
              </div>
            </div>
            <ol className="ml-auto flex items-center gap-1.5 text-sm" aria-label="Progress">
              {stages.map((s, i) => {
                const n = i + 1;
                const done = n < stage || !pending;
                const current = n === stage && pending;
                return (
                  <li key={s} className="flex items-center gap-1.5">
                    <span
                      className={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${
                        done ? "bg-emerald-600 text-white" : current ? "bg-sky-600 text-white" : "bg-zinc-800 text-zinc-500"
                      }`}
                    >
                      {done ? <Check size={13} strokeWidth={3} /> : n}
                    </span>
                    <span className={`hidden xl:inline ${current ? "font-medium text-zinc-100" : done ? "text-zinc-400" : "text-zinc-600"}`}>{s}</span>
                    {n < stages.length && <span className="mx-1 h-px w-6 bg-zinc-700" />}
                  </li>
                );
              })}
            </ol>
          </div>

          <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-2 lg:overflow-hidden lg:p-5">
            <ScreeningPanel c={c} screen={screen} decision={decision} onEdit={() => setDialog("edit")} />
            <AuditPanel key={`${c.id}:${c.text}`} c={c} audit={audit} result={result} onRun={runBiasAudit} />
          </main>

          {logOpen && (
            <div className="scroll-thin max-h-56 shrink-0 overflow-y-auto border-t border-zinc-800 bg-zinc-950 px-6 py-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Audit log</span>
                <button onClick={() => setLogOpen(false)} className="text-zinc-500 hover:text-zinc-300" aria-label="Close audit log">
                  <X size={16} />
                </button>
              </div>
              {log.length === 0 ? (
                <p className="text-sm text-zinc-500">No activity yet.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <tbody className="divide-y divide-zinc-800/70">
                    {log.map((e, i) => (
                      <tr key={i} className="align-top">
                        <td className="w-16 py-2 pr-3 tabular-nums text-zinc-500">{e.t}</td>
                        <td className="w-44 py-2 pr-3 text-zinc-300">{e.candidate}</td>
                        <td className="py-2">
                          <div className="text-zinc-200">{e.msg}</div>
                          {e.detail && <div className="mt-0.5 font-mono text-[11px] text-zinc-500">{e.detail}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          <footer className="flex shrink-0 flex-wrap items-center gap-4 border-t border-zinc-800 bg-zinc-900 px-6 py-4">
            <div className="min-w-[260px] flex-1">
              <div className={`flex items-center gap-2 text-[15px] font-semibold ${rec.tone}`}>
                {audit.phase === "running" && <Loader2 size={16} className="animate-spin" />}
                {rec.title}
              </div>
              <div className="mt-0.5 text-sm text-zinc-400">{rec.body}</div>
            </div>

            {pending ? (
              <div className="flex flex-wrap gap-2">
                <Button variant={audited && !recommendAdvance ? "danger" : "secondary"} disabled={!audited} onClick={() => decline()}>
                  <UserX size={16} /> Decline Candidate
                </Button>
                <Button
                  variant={recommendAdvance ? "primary" : "secondary"}
                  disabled={!audited}
                  onClick={advance}
                  className={bias ? "animate-glow px-5" : ""}
                >
                  <UserCheck size={16} /> Advance to Interview
                </Button>
              </div>
            ) : (
              <Button variant="secondary" onClick={undo}>
                <Undo2 size={16} /> Undo Decision
              </Button>
            )}
          </footer>
        </div>
      </div>

      {(dialog === "add" || dialog === "edit") && (
        <ResumeEditor
          mode={dialog}
          initial={dialog === "edit" ? { jobId: c.jobId, text: c.text } : null}
          onCancel={() => setDialog(null)}
          onSave={saveResume}
        />
      )}
      {dialog === "discretionary" && (
        <DiscretionaryDialog name={meta.name} onCancel={() => setDialog(null)} onConfirm={advanceDiscretionary} />
      )}
      {dialog === "declineBias" && (
        <DeclineWithBiasDialog first={meta.first} onCancel={() => setDialog(null)} onConfirm={() => decline(true)} />
      )}

      {toast && (
        <div
          role="status"
          className="animate-slide-up fixed bottom-24 right-6 z-40 w-[min(420px,calc(100vw-2rem))] rounded-xl border border-zinc-700 bg-zinc-900 p-4 shadow-2xl"
        >
          <div className="flex items-start gap-3">
            {toast.kind === "success" ? (
              <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-400" />
            ) : toast.kind === "warning" ? (
              <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-300" />
            ) : (
              <ShieldCheck size={20} className="mt-0.5 shrink-0 text-zinc-400" />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-zinc-50">{toast.title}</div>
              <div className="mt-0.5 text-sm text-zinc-400">{toast.msg}</div>
              {toast.detail && <div className="mt-2 font-mono text-[11px] leading-relaxed text-zinc-500">{toast.detail}</div>}
            </div>
            <button onClick={() => setToast(null)} className="text-zinc-500 hover:text-zinc-200" aria-label="Dismiss">
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

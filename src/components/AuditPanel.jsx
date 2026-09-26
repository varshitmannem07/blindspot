import { ArrowRight, CheckCircle2, Loader2, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { THRESHOLD, toLines } from "../engine.js";
import { AUDIT_STEPS } from "../data/seed.js";
import { fmt, signed, useCountUp } from "../lib/format.js";
import { Button, Disclosure, Label, Panel, ResumeLine, Stars } from "./ui.jsx";

/** Right panel: BLINDSPOT's counterfactual audit — idle, running and result states. */
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
            <li
              key={s}
              className={`flex items-center gap-3 ${done ? "text-emerald-300" : active ? "text-zinc-100" : "text-zinc-600"}`}
            >
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
          <div
            className={`rounded-lg border p-4 ${a.bias ? "border-emerald-500/40 bg-emerald-500/[0.07]" : "border-zinc-800 bg-zinc-950/50"}`}
          >
            <div className="text-xs text-zinc-500">Adjusted score</div>
            <div
              className={`mt-1 text-3xl font-semibold tabular-nums ${a.bias ? "text-emerald-300" : "text-zinc-200"}`}
            >
              {fmt(live)}
            </div>
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
                    <div className="mt-1 text-xs text-zinc-500">
                      {[...new Set(onLine.map((x) => x.label))].join(", ")}
                    </div>
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

export default function AuditPanel({ c, audit, result, onRun }) {
  return (
    <Panel
      title="Bias Audit"
      icon={ShieldCheck}
      accent
      action={<span className="text-xs text-zinc-500">BLINDSPOT</span>}
    >
      {audit.phase === "idle" && <AuditIdle onRun={onRun} />}
      {audit.phase === "running" && <AuditRunning step={audit.step} />}
      {audit.phase === "done" && <AuditResult c={c} result={result} />}
    </Panel>
  );
}

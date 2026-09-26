import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Briefcase,
  Check,
  CheckCircle2,
  EyeOff,
  FileText,
  Loader2,
  Plus,
  RotateCcw,
  ShieldCheck,
  Undo2,
  Upload,
  UserCheck,
  UserX,
  X,
} from "lucide-react";
import { JOBS, candidateMeta, matchJob, runAudit, screenResume, toLines } from "./engine.js";
import { ACCEPTED, extractText } from "./extract.js";
import { AUDIT_STEPS, SEED, STEP_MS } from "./data/seed.js";
import { fmt, signed, timeNow, today } from "./lib/format.js";
import { Button, StatusBadge } from "./components/ui.jsx";
import ScreeningPanel from "./components/ScreeningPanel.jsx";
import AuditPanel from "./components/AuditPanel.jsx";
import { DeclineWithBiasDialog, DiscretionaryDialog, ResumeEditor } from "./components/Dialogs.jsx";

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

  const addLog = (msg, detail, name = meta.name) =>
    setLog((l) => [{ t: timeNow(), candidate: name, msg, detail }, ...l]);

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
      timers.current.push(
        setTimeout(() => setAudits((s) => ({ ...s, [id]: { phase: "running", step: i + 1 } })), STEP_MS * (i + 1))
      );
    });
    timers.current.push(
      setTimeout(
        () => {
          setAudits((s) => ({ ...s, [id]: { phase: "done", step: AUDIT_STEPS.length } }));
          addLog(
            `Bias audit completed: ${res.bias ? "bias detected" : "no bias detected"}`,
            `${res.verdictCode} · Δ ${signed(res.delta)}`,
            name
          );
        },
        STEP_MS * (AUDIT_STEPS.length + 1)
      )
    );
  };

  const advance = () => {
    if (bias) {
      setDecision({ status: "advanced", basis: "Bias override" });
      const detail = `Audit Event Logged: Model debiasing tuple ${result.tuple} sent to retraining queue.`;
      addLog("Advanced to interview (bias override)", detail);
      notify({
        kind: "success",
        title: `${meta.name} advanced to interview`,
        msg: "Bias finding submitted to the model remediation queue.",
        detail,
      });
    } else if (screen.passed) {
      setDecision({ status: "advanced", basis: "Meets role requirements" });
      addLog("Advanced to interview", "Screening result confirmed by bias audit");
      notify({
        kind: "success",
        title: `${meta.name} advanced to interview`,
        msg: "Screening result confirmed by bias audit.",
      });
    } else {
      setDialog("discretionary");
    }
  };

  const advanceDiscretionary = (reason, note) => {
    setDialog(null);
    setDecision({ status: "advanced", basis: "Discretionary override", reason });
    addLog("Advanced to interview (discretionary override)", `Reason: ${reason}${note ? ` · Note: ${note}` : ""}`);
    notify({
      kind: "success",
      title: `${meta.name} advanced to interview`,
      msg: `Discretionary override recorded. Reason: ${reason}.`,
    });
  };

  const decline = (confirmedBias = false) => {
    if (bias && !confirmedBias) return setDialog("declineBias");
    setDialog(null);
    setDecision({ status: "declined", basis: bias ? "Declined despite bias finding" : "Validated by bias audit" });
    if (bias) {
      addLog("Declined despite bias finding", "Escalated to compliance review");
      notify({ kind: "warning", title: `${meta.name} declined`, msg: "Decision flagged for compliance review." });
    } else {
      addLog(
        "Declined",
        screen.passed ? "Recruiter declined an auto-advanced candidate" : "Deficit is merit-based. Rejection validated."
      );
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
        if (toLines(text).length < 2)
          throw new Error(
            `No readable text found in “${file.name}”. If it is a scanned image, upload a text-based PDF or Word file.`
          );
        const jobId = matchJob(text);
        const job = JOBS[jobId];
        const id = newId();
        const name = candidateMeta(text).name;
        setCandidates((list) => [...list, { id, jobId, text, applied: today(), source: file.name }]);
        setDecisions((s) => ({ ...s, [id]: pendingDecision }));
        setSelectedId(id);
        addLog(
          `Résumé uploaded (${file.name})`,
          `Auto-matched to ${job.title} · ${job.req} · screening score ${fmt(screenResume(text, job).score)}`,
          name
        );
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
    rec = {
      tone: "text-emerald-300",
      title: "Advanced to interview",
      body: decision.reason ? `${decision.basis} · ${decision.reason}` : decision.basis,
    };
  else if (decision.status === "declined")
    rec = { tone: "text-zinc-200", title: "Candidate declined", body: decision.basis };
  else if (audit.phase === "idle")
    rec = {
      tone: "text-zinc-300",
      title: "Run the bias audit to get a recommendation",
      body: "Decision options unlock once the audit is complete.",
    };
  else if (audit.phase === "running")
    rec = { tone: "text-sky-300", title: "Audit in progress…", body: "This takes a few seconds." };
  else if (bias)
    rec = {
      tone: "text-amber-200",
      title: "Recommended: Advance to interview",
      body: "The screening score was affected by bias.",
    };
  else if (screen.passed)
    rec = {
      tone: "text-emerald-200",
      title: "Recommended: Advance to interview",
      body: "Meets role requirements. No bias detected.",
    };
  else
    rec = {
      tone: "text-zinc-100",
      title: "Recommended: Decline",
      body: "Role requirements are not met. You may still advance with a documented reason.",
    };

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
          <Button
            variant="ghost"
            onClick={() => setLogOpen((o) => !o)}
            className="px-3 py-1.5 text-xs"
            aria-expanded={logOpen}
          >
            <FileText size={14} /> Audit Log{log.length > 0 && ` (${log.length})`}
          </Button>
          <Button variant="ghost" onClick={reset} className="px-3 py-1.5 text-xs">
            <RotateCcw size={14} /> Reset
          </Button>
          <div
            className="ml-1 grid h-8 w-8 place-items-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-300"
            title="Recruiter"
          >
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
            <Button
              variant="audit"
              onClick={() => fileInput.current?.click()}
              disabled={uploading > 0}
              className="w-full py-3"
            >
              {uploading > 0 ? <Loader2 size={17} className="animate-spin" /> : <Upload size={17} />}
              {uploading > 0 ? "Reading résumé…" : "Upload résumés"}
            </Button>
            <p className="mt-1.5 hidden text-center text-xs text-zinc-500 lg:block">
              PDF, Word or text · or drag files here
            </p>
          </div>
          <div className="hidden items-center justify-between px-5 pb-2 pt-5 lg:flex">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Review queue · {candidates.length}
            </span>
          </div>
          <nav
            className="scroll-thin flex gap-2 overflow-x-auto p-3 lg:min-h-0 lg:flex-1 lg:flex-col lg:gap-1 lg:overflow-y-auto lg:px-3 lg:pt-0"
            aria-label="Candidates"
          >
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
                        done
                          ? "bg-emerald-600 text-white"
                          : current
                            ? "bg-sky-600 text-white"
                            : "bg-zinc-800 text-zinc-500"
                      }`}
                    >
                      {done ? <Check size={13} strokeWidth={3} /> : n}
                    </span>
                    <span
                      className={`hidden xl:inline ${current ? "font-medium text-zinc-100" : done ? "text-zinc-400" : "text-zinc-600"}`}
                    >
                      {s}
                    </span>
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
                <button
                  onClick={() => setLogOpen(false)}
                  className="text-zinc-500 hover:text-zinc-300"
                  aria-label="Close audit log"
                >
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
                        <td className="w-24 whitespace-nowrap py-2 pr-3 tabular-nums text-zinc-500">{e.t}</td>
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
                <Button
                  variant={audited && !recommendAdvance ? "danger" : "secondary"}
                  disabled={!audited}
                  onClick={() => decline()}
                >
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
              {toast.detail && (
                <div className="mt-2 font-mono text-[11px] leading-relaxed text-zinc-500">{toast.detail}</div>
              )}
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

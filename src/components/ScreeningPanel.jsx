import { CheckCircle2, ClipboardList, Pencil, XCircle } from "lucide-react";
import { toLines } from "../engine.js";
import { fmt, signed } from "../lib/format.js";
import { Button, Disclosure, Label, Panel, Stars } from "./ui.jsx";

/** Left panel: what the legacy ATS decided and why. */
export default function ScreeningPanel({ c, screen, decision, onEdit }) {
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

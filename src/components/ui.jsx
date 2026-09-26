import { useState } from "react";
import { ChevronDown, ChevronUp, EyeOff, Star } from "lucide-react";
import { fmt } from "../lib/format.js";

export function Stars({ value, size = 18, tone = "text-amber-400" }) {
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
export function ResumeLine({ line, attrs = [], neutralize = false }) {
  if (!neutralize || !attrs.length) return <span>{line}</span>;
  const parts = [];
  let pos = 0;
  [...attrs]
    .sort((a, b) => a.start - b.start)
    .forEach((a, i) => {
      if (a.start > pos) parts.push(<span key={`t${i}`}>{line.slice(pos, a.start)}</span>);
      parts.push(
        <span key={`a${i}`}>
          <span className="text-zinc-500 line-through decoration-rose-400/80 decoration-2">
            {line.slice(a.start, a.end)}
          </span>
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

export function Label({ children }) {
  return <div className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">{children}</div>;
}

export function Disclosure({ label, children }) {
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

export function Panel({ title, action, icon: Icon, children, accent = false }) {
  return (
    <section
      className={`flex flex-col rounded-xl border bg-zinc-900 lg:min-h-0 ${accent ? "border-sky-500/25" : "border-zinc-800"}`}
    >
      <header className="flex items-center gap-2.5 border-b border-zinc-800 px-5 py-3">
        <Icon size={17} className={accent ? "text-sky-400" : "text-zinc-400"} />
        <h2 className="text-[15px] font-semibold text-zinc-100">{title}</h2>
        <div className="ml-auto">{action}</div>
      </header>
      <div className="scroll-thin lg:min-h-0 lg:flex-1 lg:overflow-y-auto">{children}</div>
    </section>
  );
}

export function Button({ variant = "secondary", className = "", children, ...props }) {
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

export const STATUS = {
  pending: { label: "Pending Review", short: "Pending", cls: "border-amber-500/30 bg-amber-500/10 text-amber-300" },
  advanced: {
    label: "Advanced to Interview",
    short: "Advanced",
    cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  },
  declined: { label: "Declined", short: "Declined", cls: "border-zinc-600 bg-zinc-800 text-zinc-300" },
};

export function StatusBadge({ status, short = false }) {
  const s = STATUS[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium ${s.cls}`}
    >
      {short ? s.short : s.label}
    </span>
  );
}

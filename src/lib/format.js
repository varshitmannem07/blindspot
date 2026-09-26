import { useEffect, useState } from "react";

export const fmt = (n) => n.toFixed(1);
export const signed = (n) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}`;
export const timeNow = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
export const today = () => new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function useCountUp(target, from, duration = 1400) {
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

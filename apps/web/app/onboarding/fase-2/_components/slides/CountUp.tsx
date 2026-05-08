"use client";

import { useEffect, useState } from "react";
import { useInView } from "motion/react";
import { useRef } from "react";

interface CountUpProps {
  to: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}

/**
 * Animated count-up cuando el elemento entra en viewport.
 * Easing: outQuart para que el final sea fluido (no de golpe).
 */
export function CountUp({ to, duration = 1500, format, className }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    const start = performance.now();
    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 4);
      setValue(Math.floor(eased * to));
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setValue(to);
      }
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, duration]);

  return (
    <span ref={ref} className={className}>
      {format ? format(value) : value.toLocaleString("es-PE")}
    </span>
  );
}

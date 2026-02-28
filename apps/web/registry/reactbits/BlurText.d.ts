import type React from "react";

export interface BlurTextProps {
  text?: string;
  delay?: number;
  className?: string;
  animateBy?: "words" | "letters" | string;
  direction?: "top" | "bottom" | string;
  threshold?: number;
  rootMargin?: string;
  animationFrom?: Record<string, unknown>;
  animationTo?: Array<Record<string, unknown>>;
  easing?: (value: number) => number;
  onAnimationComplete?: () => void;
  stepDuration?: number;
}

declare const BlurText: React.FC<BlurTextProps>;
export default BlurText;

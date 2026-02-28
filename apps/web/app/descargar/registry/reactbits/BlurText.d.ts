import * as React from "react";

type AnimationSnapshot = {
  filter?: string;
  opacity?: number;
  y?: number;
};

export type BlurTextProps = {
  text?: string;
  delay?: number;
  className?: string;
  animateBy?: "words" | "letters" | string;
  direction?: "top" | "bottom" | string;
  threshold?: number;
  rootMargin?: string;
  animationFrom?: AnimationSnapshot;
  animationTo?: AnimationSnapshot[];
  easing?: (t: number) => number;
  onAnimationComplete?: () => void;
  stepDuration?: number;
};

declare const BlurText: React.FC<BlurTextProps>;

export default BlurText;

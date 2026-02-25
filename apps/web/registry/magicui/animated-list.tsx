"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";

type AnimatedListProps = {
  className?: string;
  delay?: number;
  children: ReactNode;
};

function cn(...classNames: Array<string | null | undefined | false>): string {
  return classNames.filter(Boolean).join(" ");
}

const ITEM_ANIMATION_STYLE: CSSProperties = {
  opacity: 0,
  transform: "translateY(10px)",
  animationName: "gobernaAnimatedListIn",
  animationDuration: "420ms",
  animationTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
  animationFillMode: "forwards",
  willChange: "opacity, transform",
};

export function AnimatedList({ className, delay = 1000, children }: AnimatedListProps) {
  const items = Children.toArray(children);

  return (
    <div className={cn("goberna-animated-list", className)} role="list">
      {items.map((child, index) => {
        if (!isValidElement(child)) return child;

        const element = child as ReactElement<{ style?: CSSProperties; role?: string }>;
        const mergedStyle: CSSProperties = {
          ...ITEM_ANIMATION_STYLE,
          ...(element.props.style ?? {}),
          animationDelay: `${index * delay}ms`,
        };

        return cloneElement(element, {
          key: element.key ?? `animated-list-item-${index}`,
          role: element.props.role ?? "listitem",
          style: mergedStyle,
        });
      })}

      <style>{`
        @keyframes gobernaAnimatedListIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .goberna-animated-list > * {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>
    </div>
  );
}


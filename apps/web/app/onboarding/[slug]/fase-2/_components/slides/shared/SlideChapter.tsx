"use client";

import { motion } from "motion/react";

interface SlideChapterProps {
  actNumber: "I" | "II" | "III" | "IV";
  actTitle: string;
  actSubtitle: string;
  accentColor: string;
}

export function SlideChapter({
  actNumber,
  actTitle,
  actSubtitle,
  accentColor,
}: SlideChapterProps) {
  return (
    <div className="relative flex-1 flex flex-col items-center justify-center bg-[#020a1e] overflow-hidden min-h-[70vh]">
      {/* Ghost act number — absolute, behind content */}
      <div
        className="absolute select-none pointer-events-none font-black leading-none"
        style={{
          fontSize: "200px",
          opacity: 0.06,
          color: accentColor,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          letterSpacing: "-0.05em",
        }}
      >
        {actNumber}
      </div>

      {/* Decorative horizontal lines */}
      <div className="absolute inset-x-0 top-0 flex flex-col gap-3 pt-8 px-12 pointer-events-none">
        {[0.4, 0.25, 0.15, 0.08].map((opacity, i) => (
          <div
            key={i}
            className="h-[1px]"
            style={{ backgroundColor: accentColor, opacity }}
          />
        ))}
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center gap-6 text-center px-8">
        {/* Badge pill */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <span
            className="inline-block text-[11px] font-black uppercase tracking-[0.25em] px-4 py-1.5 rounded-full"
            style={{
              color: accentColor,
              backgroundColor: `${accentColor}18`,
              border: `1px solid ${accentColor}40`,
            }}
          >
            ACTO {actNumber}
          </span>
        </motion.div>

        {/* Title */}
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="text-5xl sm:text-7xl font-black text-white leading-none tracking-tight"
        >
          {actTitle}
        </motion.h2>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="text-sm text-white/40 max-w-xs"
        >
          {actSubtitle}
        </motion.p>

        {/* Animated accent separator line */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.3, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="origin-left"
          style={{ width: "80px", height: "2px", backgroundColor: accentColor }}
        />
      </div>

      {/* Bottom decorative lines */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 pb-8 px-12 pointer-events-none">
        {[0.08, 0.15, 0.25, 0.4].map((opacity, i) => (
          <div
            key={i}
            className="h-[1px]"
            style={{ backgroundColor: accentColor, opacity }}
          />
        ))}
      </div>
    </div>
  );
}

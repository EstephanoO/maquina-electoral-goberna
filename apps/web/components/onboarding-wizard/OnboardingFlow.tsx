"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft } from "lucide-react";

import {
  onboardingSteps,
  type OnboardingContext,
} from "@/types/onboarding";
import { CloudSkyBg } from "@/components/cloud-sky-bg";

import { StepForm } from "./StepForm";
import { StepSingleChoice } from "./StepSingleChoice";
import { StepCargoApi } from "./StepCargoApi";
import { StepOrgApi } from "./StepOrgApi";
import { StepFotoUpload } from "./StepFotoUpload";
import { StepProvisioning } from "./StepProvisioning";
import { StepDoneFinal } from "./StepDoneFinal";
import { useOnboardingDynamicOptions } from "./hooks/useOnboardingDynamicOptions";

export function OnboardingFlow() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [data, setData] = useState<OnboardingContext>({});

  const currentStep = onboardingSteps[stepIndex];
  const total = onboardingSteps.length;

  const { getDynamicOptions } = useOnboardingDynamicOptions(data);

  const goNext = useCallback(() => {
    setStepIndex((i) => Math.min(i + 1, total - 1));
  }, [total]);

  const goBack = useCallback(() => {
    setStepIndex((i) => Math.max(i - 1, 0));
  }, []);

  const handleStepData = useCallback(
    (value?: unknown) => {
      if (!currentStep) return;
      if (value !== undefined) {
        setData((d) => ({ ...d, [currentStep.id]: value }));
      }
      goNext();
    },
    [currentStep, goNext],
  );

  if (!currentStep) return null;

  const isProvisioningStep = currentStep.type === "provisioning";
  const isDoneStep = currentStep.type === "done-final";
  const showBack = stepIndex > 0 && !isProvisioningStep && !isDoneStep;
  const sectionPill = currentStep.chapter
    ? `Capítulo ${currentStep.chapter.num} de ${currentStep.chapter.total} · ${currentStep.chapter.label}`
    : null;

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#020a1e] text-white">
      <CloudSkyBg />

      {/* Top: section pill + back */}
      <div className="fixed top-0 inset-x-0 z-30 px-4 sm:px-8 pt-4 sm:pt-5 flex items-start justify-between gap-3 pointer-events-none">
        {/* Back button */}
        <div className="pointer-events-auto">
          {showBack ? (
            <button
              type="button"
              onClick={goBack}
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-[#020a1e]/60 backdrop-blur-md px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-amber-400/80 hover:text-amber-400 hover:border-amber-400/40 transition-colors font-semibold"
            >
              <ChevronLeft className="size-3.5" />
              Atrás
            </button>
          ) : (
            <span className="block size-8" />
          )}
        </div>

        {/* Section pill — centrado */}
        {sectionPill && (
          <motion.div
            key={`section-${currentStep.chapter?.num}`}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="pointer-events-auto rounded-full bg-[#020a1e]/80 backdrop-blur-md border border-amber-400/20 px-4 py-1.5 text-[10px] uppercase tracking-[0.3em] text-amber-400/90 font-semibold"
          >
            {sectionPill}
          </motion.div>
        )}

        {/* Filler para mantener centrado */}
        <span className="hidden sm:block size-8" />
      </div>

      {/* Main content */}
      <div className="relative z-10 mx-auto w-full max-w-5xl px-4 sm:px-6 pt-24 pb-32 min-h-screen flex flex-col">
        <div className="flex flex-1 items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep.id}
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -60 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="w-full"
            >
              {currentStep.type === "form" && (
                <StepForm
                  title={currentStep.title}
                  {...(currentStep.subtitle && { subtitle: currentStep.subtitle })}
                  {...(currentStep.guideText && { guideText: currentStep.guideText })}
                  {...(currentStep.ctaText && { ctaText: currentStep.ctaText })}
                  fields={currentStep.fields ?? []}
                  onNext={(formData) => handleStepData(formData)}
                />
              )}

              {currentStep.type === "single-select" && (
                <StepSingleChoice
                  title={currentStep.title}
                  {...(currentStep.subtitle && { subtitle: currentStep.subtitle })}
                  {...(currentStep.guideText && { guideText: currentStep.guideText })}
                  options={getDynamicOptions(currentStep.id, currentStep.options) ?? []}
                  onNext={(val) => handleStepData(val)}
                />
              )}

              {currentStep.type === "api-cargo" && (
                <StepCargoApi
                  title={currentStep.title}
                  {...(currentStep.subtitle && { subtitle: currentStep.subtitle })}
                  {...(currentStep.guideText && { guideText: currentStep.guideText })}
                  {...(data.level && { nivelFilter: data.level as string })}
                  onNext={(cargo) => handleStepData(cargo)}
                />
              )}

              {currentStep.type === "api-organizacion" && (
                <StepOrgApi
                  title={currentStep.title}
                  {...(currentStep.subtitle && { subtitle: currentStep.subtitle })}
                  {...(currentStep.guideText && { guideText: currentStep.guideText })}
                  onNext={(org) => handleStepData(org)}
                />
              )}

              {currentStep.type === "foto-upload" && (
                <StepFotoUpload
                  title={currentStep.title}
                  {...(currentStep.subtitle && { subtitle: currentStep.subtitle })}
                  {...(currentStep.ctaText && { ctaText: currentStep.ctaText })}
                  onNext={(dataUrl) => handleStepData(dataUrl ?? "")}
                />
              )}

              {currentStep.type === "provisioning" && (
                <StepProvisioning
                  title={currentStep.title}
                  {...(currentStep.subtitle && { subtitle: currentStep.subtitle })}
                  data={data}
                  onGoBack={goBack}
                  onCompleted={(output) => {
                    setData((d) => ({ ...d, provisioning: output }));
                    goNext();
                  }}
                />
              )}

              {currentStep.type === "done-final" && (
                <StepDoneFinal
                  title={currentStep.title}
                  {...(currentStep.subtitle && { subtitle: currentStep.subtitle })}
                  dashboardUrl={
                    (data.provisioning as { dashboard_url?: string } | undefined)?.dashboard_url ?? "/home"
                  }
                  onContinue={(url) => router.push(url)}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Footer nav: Goberna logo + dot indicator */}
      <div className="fixed bottom-0 inset-x-0 z-20 bg-gradient-to-t from-[#020a1e] via-[#020a1e]/95 to-transparent backdrop-blur-md">
        <div className="mx-auto max-w-5xl px-4 sm:px-8 py-3 sm:py-4 flex items-center justify-between gap-3">
          {/* Goberna footer */}
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-400/70">
            <span className="size-7 rounded-full border border-amber-400/40 bg-amber-400/10 flex items-center justify-center text-amber-400 font-black text-xs">
              G
            </span>
            <span className="hidden sm:inline font-semibold">Goberna · Tu candidatura</span>
          </div>

          {/* Dot indicator */}
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-1.5">
              {onboardingSteps.map((s, i) => {
                const isActive = i === stepIndex;
                const isPast = i < stepIndex;
                return (
                  <span
                    key={s.id}
                    className={`h-1.5 rounded-full transition-all ${
                      isActive
                        ? "w-10 bg-amber-400"
                        : isPast
                          ? "w-3 bg-amber-400/40"
                          : "w-3 bg-gray-700"
                    }`}
                  />
                );
              })}
            </div>
            <span className="text-xs text-gray-400 tabular-nums">
              <span className="text-amber-400 font-semibold">{stepIndex + 1}</span> / {total}
            </span>
          </div>

          {/* Filler */}
          <span className="size-7" />
        </div>
      </div>
    </div>
  );
}

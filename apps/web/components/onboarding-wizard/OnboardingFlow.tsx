"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft } from "lucide-react";

import {
  onboardingSteps,
  type OnboardingContext,
} from "@/types/onboarding";

import { ProgressBar } from "./ProgressBar";
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

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.15),transparent_50%)]" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-8 sm:px-6 sm:py-12">
        <ProgressBar currentStep={stepIndex + 1} totalSteps={total} />

        {stepIndex > 0 && currentStep.type !== "provisioning" && currentStep.type !== "done-final" && (
          <button
            onClick={goBack}
            className="mb-4 inline-flex w-fit items-center gap-1.5 text-xs uppercase tracking-wider text-amber-300 hover:text-amber-200"
          >
            <ChevronLeft className="size-4" />
            Atrás
          </button>
        )}

        <div className="flex flex-1 items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
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
    </div>
  );
}

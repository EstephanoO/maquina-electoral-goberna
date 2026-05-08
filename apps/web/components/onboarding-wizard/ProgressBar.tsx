'use client';

import { motion } from "motion/react";
import { Check } from "lucide-react";

interface ProgressBarProps {
  currentStep: number;
  totalSteps: number;
  hiddenStepIds?: string[];
  onboardingSteps?: Array<{ id: string; }>;
}

export function ProgressBar({ currentStep, totalSteps, hiddenStepIds = [], onboardingSteps }: ProgressBarProps) {
  // Calcular pasos visibles reales
  let visibleStepCount = 0;
  let visibleCurrentStep = 0;
  
  if (onboardingSteps) {
    // Contar todos los pasos visibles
    for (let i = 0; i < onboardingSteps.length; i++) {
      if (!hiddenStepIds.includes(onboardingSteps[i].id)) {
        visibleStepCount++;
      }
    }
    
    // Encontrar el paso visible actual
    let visibleIndex = 0;
    for (let i = 0; i < onboardingSteps.length; i++) {
      const step = onboardingSteps[i];
      
      // Si es el paso actual, guardar el índice visible actual
      if (i === currentStep) {
        visibleCurrentStep = visibleIndex;
        break;
      }
      
      // No contar pasos ocultos
      if (!hiddenStepIds.includes(step.id)) {
        visibleIndex++;
      }
    }
  } else {
    // Fallback simple
    visibleStepCount = totalSteps - hiddenStepIds.length;
    visibleCurrentStep = currentStep;
  }

  const progress = ((visibleCurrentStep + 1) / visibleStepCount) * 100;

  return (
    <div className="w-full">
      {/* Progress bar */}
      <div className="relative h-1.5 sm:h-2 bg-gray-800/50 rounded-full overflow-hidden mb-3 sm:mb-4 border border-gray-700/50">
        <motion.div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-500 to-amber-600"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
            animate={{ x: ["-100%", "200%"] }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          />
        </motion.div>
      </div>

      {/* Step indicators - Simplified for mobile */}
      <div className="flex justify-between items-center">
        {Array.from({ length: visibleStepCount }).map((_, stepIndex) => {
          const stepNumber = stepIndex + 1;
          return (
            <motion.div
              key={`visible-step-${stepNumber}`}
              className="flex flex-col items-center gap-1"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: stepIndex * 0.05 }}
            >
              <motion.div
                className={`flex items-center justify-center w-6 h-6 sm:w-8 sm:h-8 rounded-full border-2 ${
                  stepIndex <= visibleCurrentStep
                    ? "bg-gradient-to-br from-amber-500 to-amber-600 border-amber-400/50 shadow-lg shadow-amber-500/20"
                    : "bg-gray-800/50 border-gray-700/50"
                }`}
                animate={{
                  scale: stepIndex === visibleCurrentStep ? [1, 1.1, 1] : 1,
                }}
                transition={{
                  duration: 0.5,
                  repeat: stepIndex === visibleCurrentStep ? Infinity : 0,
                  repeatDelay: 1,
                }}
              >
                {stepIndex < visibleCurrentStep ? (
                  <Check className="w-3 h-3 sm:w-4 sm:h-4 text-black" />
                ) : (
                  <span className={`text-[10px] sm:text-xs ${stepIndex === visibleCurrentStep ? 'text-black font-semibold' : 'text-gray-500'}`}>
                    {stepNumber}
                  </span>
                )}
              </motion.div>
            </motion.div>
          );
        })}
      </div>

      {/* Step counter */}
      <motion.div
        className="text-center mt-2 sm:mt-3 text-xs sm:text-sm text-gray-400"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        Fase {visibleCurrentStep + 1} de {visibleStepCount}
      </motion.div>
    </div>
  );
}
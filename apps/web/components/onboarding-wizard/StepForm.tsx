"use client";

import { motion } from "motion/react";
import { ChevronRight, Eye, EyeOff, AlertCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { FormField } from "@/types/onboarding";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Label,
} from "../ui";

interface StepFormProps {
  title: string;
  subtitle?: string;
  guideText?: string;
  fields: FormField[];
  ctaText?: string;
  onNext: (formData: Record<string, string>) => void;
}

function validateField(field: FormField, value: string): string | null {
  const v = (value ?? "").trim();
  if (field.required && v.length === 0) return "Campo requerido";
  if (v.length === 0) return null; // optional + empty = OK
  if (field.minLength && v.length < field.minLength) {
    return `Mínimo ${field.minLength} caracteres`;
  }
  if (field.maxLength && v.length > field.maxLength) {
    return `Máximo ${field.maxLength} caracteres`;
  }
  if (field.pattern && !new RegExp(field.pattern).test(v)) {
    return "Formato inválido";
  }
  if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
    return "Email inválido";
  }
  return null;
}

export function StepForm({
  title,
  subtitle,
  guideText,
  fields,
  ctaText = "Continuar",
  onNext,
}: StepFormProps) {
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-focus al primer input cuando aparece el step
  useEffect(() => {
    const t = setTimeout(() => firstInputRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, []);

  const handleChange = (id: string, value: string): void => {
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handleBlur = (id: string): void => {
    setTouched((prev) => ({ ...prev, [id]: true }));
  };

  // Errors por field — solo se muestran si el campo fue tocado.
  const errors = useMemo(() => {
    const out: Record<string, string | null> = {};
    for (const f of fields) {
      out[f.id] = validateField(f, formData[f.id] ?? "");
    }
    return out;
  }, [fields, formData]);

  const isFormValid = useMemo(() => {
    return fields.every((f) => errors[f.id] === null);
  }, [fields, errors]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    // Marcar todo como touched para mostrar todos los errores si hay alguno
    setTouched(Object.fromEntries(fields.map((f) => [f.id, true])));
    if (isFormValid) {
      onNext(formData);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-3xl"
    >
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="text-4xl sm:text-5xl md:text-6xl mb-3 sm:mb-4 text-white leading-[0.95] font-black tracking-tight"
      >
        {title}
      </motion.h2>

      {subtitle && (
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-base sm:text-lg text-gray-300 mb-6 sm:mb-8"
        >
          {subtitle}
        </motion.p>
      )}

      {guideText && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="mb-6 sm:mb-8 p-3 sm:p-4 bg-gradient-to-r from-amber-500/10 to-blue-500/10 border border-amber-500/20 rounded-xl"
        >
          <p className="text-xs sm:text-sm text-gray-300 leading-relaxed">
            {guideText}
          </p>
        </motion.div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          {fields.map((field, index) => {
            const error = errors[field.id];
            const showError = touched[field.id] && error;
            const fullWidth =
              field.type === "textarea" ||
              field.type === "password" ||
              field.id === "candidateName" ||
              fields.length === 1;
            const isPassword = field.type === "password";
            const showPwd = !!showPassword[field.id];

            return (
              <motion.div
                key={field.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + index * 0.05 }}
                className={fullWidth ? "md:col-span-2" : ""}
              >
                <Label
                  htmlFor={field.id}
                  className="block text-sm text-gray-300 mb-2 font-medium"
                >
                  {field.label}
                  {field.required && (
                    <span className="text-amber-400 ml-1" aria-hidden>*</span>
                  )}
                </Label>

                {field.type === "select" && field.options ? (
                  <Select
                    value={formData[field.id] || ""}
                    onValueChange={(value: string) => {
                      handleChange(field.id, value);
                      handleBlur(field.id);
                    }}
                    {...(field.required === true && { required: true })}
                  >
                    <SelectTrigger
                      id={field.id}
                      className={`w-full ${showError ? "border-red-500/60" : ""}`}
                    >
                      <SelectValue placeholder={field.placeholder ?? "Seleccionar..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="relative">
                    <input
                      ref={index === 0 && field.type !== "select" ? firstInputRef : undefined}
                      type={
                        isPassword ? (showPwd ? "text" : "password") : field.type
                      }
                      id={field.id}
                      value={formData[field.id] || ""}
                      onChange={(e) => handleChange(field.id, e.target.value)}
                      onBlur={() => handleBlur(field.id)}
                      placeholder={field.placeholder}
                      autoComplete={field.autoComplete ?? (isPassword ? "new-password" : undefined)}
                      {...(field.required === true && { required: true })}
                      {...(field.minLength && { minLength: field.minLength })}
                      {...(field.maxLength && { maxLength: field.maxLength })}
                      className={`w-full px-4 py-3 sm:py-3.5 ${
                        isPassword ? "pr-11" : ""
                      } bg-black/40 border-2 rounded-xl text-white placeholder:text-gray-500 focus:outline-none transition-all backdrop-blur-sm text-base touch-manipulation ${
                        showError
                          ? "border-red-500/60 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
                          : "border-gray-700/50 hover:border-gray-600 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                      }`}
                    />
                    {isPassword && (
                      <button
                        type="button"
                        onClick={() =>
                          setShowPassword((prev) => ({
                            ...prev,
                            [field.id]: !prev[field.id],
                          }))
                        }
                        tabIndex={-1}
                        aria-label={showPwd ? "Ocultar contraseña" : "Mostrar contraseña"}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-gray-500 hover:text-amber-400 hover:bg-amber-500/10 transition"
                      >
                        {showPwd ? (
                          <EyeOff className="size-4" />
                        ) : (
                          <Eye className="size-4" />
                        )}
                      </button>
                    )}
                  </div>
                )}

                {/* Helper text o error inline */}
                <div className="mt-1.5 min-h-[18px] text-xs">
                  {showError ? (
                    <span className="inline-flex items-center gap-1 text-red-400">
                      <AlertCircle className="size-3" />
                      {error}
                    </span>
                  ) : (
                    field.helper && (
                      <span className="text-gray-500">{field.helper}</span>
                    )
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          whileHover={{ scale: isFormValid ? 1.02 : 1 }}
          whileTap={{ scale: isFormValid ? 0.98 : 1 }}
          type="submit"
          disabled={!isFormValid}
          className={`w-full px-6 sm:px-8 py-3.5 sm:py-4 rounded-full flex items-center justify-center gap-2 transition-all border-2 text-base sm:text-lg touch-manipulation ${
            isFormValid
              ? "bg-gradient-to-r from-amber-500 to-amber-600 hover:shadow-2xl hover:shadow-amber-500/30 active:shadow-amber-500/40 border-amber-400/50 text-black font-semibold"
              : "bg-gray-800/30 border-gray-700/50 opacity-40 cursor-not-allowed text-gray-500"
          }`}
        >
          <span>{ctaText}</span>
          <ChevronRight className="w-5 h-5" />
        </motion.button>
      </form>
    </motion.div>
  );
}

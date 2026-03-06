"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Iphone17Pro } from "@/components/ui/iphone-17-pro";
import { FONT_STACK } from "@/lib/constants";
import BlurText from "@/registry/reactbits/BlurText";

const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.estephano.gobernaterritory02&hl=es_PE";
const TESTFLIGHT_URL = "https://testflight.apple.com/join/JAZ5smzy";
const TESTFLIGHT_APP_URL = "https://apps.apple.com/us/app/testflight/id899247664";
const BRAND_ICON_SRC = "/isotipo_2_-removebg-preview.png";
const APPLE_LOGO_SRC = "/computer-logo-white-phone-icon-in-transparent-background-free-png.png";
const TESTFLIGHT_SCREENSHOT_SRC = "/InstralaTest.jpg";
const IPHONE_PREVIEW_SRC = "/instalargoberna.webp";
const THANKS_TEXT = "GRACIAS POR TRABAJAR Y CONFIAR EN NOSOTROS";

type Platform = "choose" | "android" | "iphone";
const IPHONE_STEPS = [1, 2, 3] as const;

const sectionTransition = {
  duration: 0.52,
  ease: [0.22, 1, 0.36, 1] as const,
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.05,
    },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 12, filter: "blur(8px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      duration: 0.33,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  },
};

export default function DescargarPage() {
  const [platform, setPlatform] = useState<Platform>("choose");
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [iphoneScrollProgress, setIphoneScrollProgress] = useState(0);
  const [activeIphonePanel, setActiveIphonePanel] = useState(0);
  const [iphonePanelFloat, setIphonePanelFloat] = useState(0);
  const iphoneScrollRef = useRef<HTMLDivElement | null>(null);
  const autoAdvanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const statusTitle = useMemo(() => {
    if (platform === "android") return "Descarga Android";
    return "Elige tu dispositivo";
  }, [platform]);

  const activeIphoneStep = useMemo(() => {
    const idx = activeIphonePanel - 1;
    return Math.max(0, Math.min(IPHONE_STEPS.length - 1, idx));
  }, [activeIphonePanel]);

  const stepperEntranceProgress = useMemo(() => {
    const raw = (iphonePanelFloat - 0.04) / 0.72;
    return Math.max(0, Math.min(1, raw));
  }, [iphonePanelFloat]);
  const currentIphoneStep = activeIphoneStep + 1;
  const isIphoneThanksPanel = activeIphonePanel >= IPHONE_STEPS.length + 1;

  function resetIphoneFlowState() {
    setIphoneScrollProgress(0);
    setIphonePanelFloat(0);
    setActiveIphonePanel(0);
  }

  function openIphoneFlow() {
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }
    if (submitTimeoutRef.current) {
      clearTimeout(submitTimeoutRef.current);
      submitTimeoutRef.current = null;
    }

    setEnviado(false);
    setIsSubmitting(false);
    setNombre("");
    setCorreo("");
    resetIphoneFlowState();
    setPlatform("iphone");
  }

  function closeIphoneFlow() {
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }
    if (submitTimeoutRef.current) {
      clearTimeout(submitTimeoutRef.current);
      submitTimeoutRef.current = null;
    }

    setIsSubmitting(false);
    resetIphoneFlowState();
    setPlatform("choose");
  }

  function goToIphonePanel(panelIndex: number) {
    if (!iphoneScrollRef.current) return;
    const clampedPanelIndex = Math.max(0, Math.min(IPHONE_STEPS.length + 1, panelIndex));
    iphoneScrollRef.current.scrollTo({
      top: iphoneScrollRef.current.clientHeight * clampedPanelIndex,
      behavior: "smooth",
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || !nombre.trim() || !correo.trim()) return;
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: nombre.trim(),
          correo: correo.trim(),
          plataforma: platform === "android" ? "android" : "iphone",
        }),
      });

      if (!res.ok) throw new Error("error");

      setEnviado(true);
      setNombre("");
      setCorreo("");

      if (platform === "iphone") {
        if (autoAdvanceTimeoutRef.current) {
          clearTimeout(autoAdvanceTimeoutRef.current);
        }
        autoAdvanceTimeoutRef.current = setTimeout(() => {
          goToIphonePanel(2);
        }, 900);
      }
    } catch {
      // Silently fail — show success anyway to avoid friction
      setEnviado(true);
      setNombre("");
      setCorreo("");
    } finally {
      setIsSubmitting(false);
    }
  }

  function goToFirstIphoneStep() {
    goToIphonePanel(1);
  }

  const syncIphoneScrollState = useCallback((scrollEl: HTMLDivElement) => {
    const panelsTotal = IPHONE_STEPS.length + 2;
    const panelFloat = scrollEl.clientHeight > 0 ? scrollEl.scrollTop / scrollEl.clientHeight : 0;
    setIphonePanelFloat(panelFloat);
    const panelIndex = Math.round(panelFloat);
    setActiveIphonePanel(Math.max(0, Math.min(panelsTotal - 1, panelIndex)));

    const stepFloat = Math.max(0, Math.min(IPHONE_STEPS.length - 1, panelFloat - 1));
    const stepProgress = IPHONE_STEPS.length > 1 ? stepFloat / (IPHONE_STEPS.length - 1) : 1;
    setIphoneScrollProgress(Math.max(0, Math.min(1, stepProgress)));
  }, []);

  useEffect(() => {
    if (platform !== "iphone") return;

    const scrollEl = iphoneScrollRef.current;
    if (!scrollEl) return;
    scrollEl.scrollTo({ top: 0, behavior: "auto" });

    syncIphoneScrollState(scrollEl);
    const raf = window.requestAnimationFrame(() => {
      scrollEl.scrollTo({ top: 0, behavior: "auto" });
      syncIphoneScrollState(scrollEl);
    });
    const onResize = () => syncIphoneScrollState(scrollEl);
    window.addEventListener("resize", onResize);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [platform, syncIphoneScrollState]);

  useEffect(() => {
    return () => {
      if (autoAdvanceTimeoutRef.current) {
        clearTimeout(autoAdvanceTimeoutRef.current);
      }
      if (submitTimeoutRef.current) {
        clearTimeout(submitTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      style={{ fontFamily: FONT_STACK }}
      className="relative min-h-screen overflow-x-hidden bg-[#060B12] text-white"
    >
      <div className="pointer-events-none fixed inset-0 opacity-[0.24] [background-image:linear-gradient(rgba(160,192,234,0.28)_1px,transparent_1px),linear-gradient(90deg,rgba(160,192,234,0.28)_1px,transparent_1px)] [background-size:64px_64px]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(29,69,124,0.18)_0%,rgba(29,69,124,0.11)_26%,transparent_62%)]" />

      <main
        className={`relative mx-auto flex min-h-screen w-full flex-col items-center ${
          platform === "iphone"
            ? "max-w-none justify-start px-0 py-0"
            : "max-w-3xl justify-center px-4 py-12 sm:px-8"
        }`}
      >
        <AnimatePresence mode="wait">
          {platform === "choose" ? (
            <motion.section
              key="choose"
              initial={{ opacity: 0, y: 18, scale: 0.93, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -12, scale: 1.06, filter: "blur(8px)" }}
              transition={sectionTransition}
              className="w-full max-w-[560px] text-center"
            >
              <Image
                src={BRAND_ICON_SRC}
                alt="Goberna"
                width={64}
                height={74}
                className="mx-auto mb-5 h-[72px] w-auto object-contain"
                unoptimized
                priority
              />

              <h1 className="text-[46px] font-extrabold uppercase leading-[0.96] tracking-[-0.03em] text-white sm:text-[62px]">
                Goberna
              </h1>
              <h2 className="mt-2 text-[46px] font-extrabold uppercase leading-[0.96] tracking-[-0.03em] text-[#f5c542] sm:text-[62px]">
                Territorio
              </h2>

              <p className="mt-5 text-base text-white/60 sm:text-lg">
                App de campo para operacion territorial
              </p>

              <p className="mt-9 text-xs font-semibold uppercase tracking-[0.22em] text-white/42 sm:text-sm">
                Elige tu dispositivo
              </p>

              <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
                className="mt-5 space-y-3"
              >
                <PlatformBtn
                  onClick={() => setPlatform("android")}
                  icon={<AndroidIcon size={18} color="#3DDC84" />}
                  title="Android"
                  subtitle="Descarga directa"
                  accent="#3DDC84"
                />
                <PlatformBtn
                  onClick={openIphoneFlow}
                  icon={<AppleIcon size={24} color="#ffffff" />}
                  title="iPhone"
                  subtitle="Via TestFlight"
                  accent="#ffffff"
                />
              </motion.div>
            </motion.section>
          ) : null}

          {platform === "android" ? (
            <motion.section
              key="android"
              initial={{ opacity: 0, y: 12, scale: 0.94, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -10, scale: 1.05, filter: "blur(8px)" }}
              transition={sectionTransition}
              className="w-full max-w-[560px]"
            >
              <FlowHeader title={statusTitle} onBack={() => setPlatform("choose")} />

              <div className="rounded-3xl border border-[#3DDC84]/30 bg-[#3DDC84]/8 p-5 backdrop-blur-md">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#3DDC84]/45 bg-[#3DDC84]/18">
                    <AndroidIcon size={16} color="#3DDC84" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Instalacion Android</h3>
                    <p className="text-sm text-white/66">
                      Disponible inmediatamente en Google Play.
                    </p>
                  </div>
                </div>

                <a
                  href={PLAY_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--goberna-gold)] px-4 py-3 text-sm font-bold text-[#0f172a] transition-all duration-200 hover:brightness-105"
                >
                  <PlayStoreIcon size={14} />
                  Descargar en Google Play
                </a>
              </div>
            </motion.section>
          ) : null}

          {platform === "iphone" ? (
            <motion.section
              key="iphone"
              initial={{ opacity: 0, y: 12, scale: 0.94, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -10, scale: 1.05, filter: "blur(8px)" }}
              transition={sectionTransition}
              className="relative h-screen w-screen overflow-hidden"
            >
              <div className="relative z-20 h-full">
                <div className="pointer-events-none absolute inset-x-0 top-5 z-30">
                  <div className="mx-auto flex w-full max-w-[1240px] justify-end px-4 sm:px-10">
                    <button
                      type="button"
                      onClick={closeIphoneFlow}
                      className="pointer-events-auto inline-flex items-center gap-1 rounded-full border border-white/24 px-3 py-1.5 text-xs font-semibold text-white/82 transition-colors duration-200 hover:border-white/40 hover:text-white"
                    >
                      <ArrowLeftIcon size={14} />
                      Volver
                    </button>
                  </div>
                </div>

                {stepperEntranceProgress > 0.01 && !isIphoneThanksPanel ? (
                  <motion.div
                    animate={{
                      opacity: stepperEntranceProgress,
                      x: (1 - stepperEntranceProgress) * -120,
                    }}
                    transition={{ type: "spring", stiffness: 210, damping: 28, mass: 0.42 }}
                    className="pointer-events-none absolute inset-0 z-20 px-4 sm:px-10"
                  >
                    <div className="mx-auto h-full w-full max-w-[1240px]">
                      <div className="h-full w-[68px] sm:w-[108px]">
                        <IphoneStepper activeStep={currentIphoneStep} progress={iphoneScrollProgress} />
                      </div>
                    </div>
                  </motion.div>
                ) : null}

                <div
                  ref={iphoneScrollRef}
                  onScroll={(event) => syncIphoneScrollState(event.currentTarget)}
                  className="h-full snap-y snap-mandatory overflow-y-auto overscroll-y-contain scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  <section className="flex h-screen snap-start items-center justify-center px-6">
                    <div className="mx-auto max-w-4xl text-center">
                      <motion.div
                        initial={{ opacity: 0, y: 12, scale: 0.96, filter: "blur(8px)" }}
                        animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <div className="mx-auto mb-8 flex items-center justify-center gap-5 sm:gap-8">
                          <motion.div
                            initial={{ opacity: 0, y: 8, filter: "blur(7px)" }}
                            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                            transition={{ duration: 0.34, delay: 0.06 }}
                            className="flex items-center justify-center"
                          >
                            <Image
                              src={BRAND_ICON_SRC}
                              alt="Logo Goberna"
                              width={132}
                              height={152}
                              className="h-[110px] w-auto object-contain drop-shadow-[0_10px_28px_rgba(0,0,0,0.45)] sm:h-[138px]"
                              unoptimized
                            />
                          </motion.div>

                          <BlurText
                            text="X"
                            delay={30}
                            animateBy="letters"
                            direction="top"
                            className="translate-x-1 text-2xl font-semibold uppercase tracking-[0.08em] text-white/88 sm:translate-x-2 sm:text-3xl"
                          />

                          <motion.div
                            initial={{ opacity: 0, y: 8, filter: "blur(7px)" }}
                            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                            transition={{ duration: 0.34, delay: 0.12 }}
                            className="flex items-center justify-center"
                          >
                            <Image
                              src={APPLE_LOGO_SRC}
                              alt="Logo Apple"
                              width={136}
                              height={136}
                              className="h-[104px] w-[104px] object-contain drop-shadow-[0_10px_28px_rgba(0,0,0,0.45)] sm:h-[130px] sm:w-[130px]"
                              unoptimized
                            />
                          </motion.div>
                        </div>

                        <div className="space-y-1 text-center">
                          <BlurText
                            text="INSTALA GOBERNA TERRITORIO"
                            delay={36}
                            animateBy="words"
                            direction="top"
                            className="mx-auto max-w-4xl justify-center text-balance text-3xl font-extrabold uppercase leading-[1.04] tracking-[-0.03em] text-white sm:text-5xl"
                          />
                          <BlurText
                            text="EN TU IPHONE"
                            delay={42}
                            animateBy="words"
                            direction="top"
                            className="mx-auto max-w-3xl justify-center text-balance text-3xl font-extrabold uppercase leading-[1.04] tracking-[-0.03em] text-white sm:text-5xl"
                          />
                        </div>

                        <p className="mx-auto mt-6 max-w-3xl text-center text-sm leading-relaxed text-white/74 sm:text-lg">
                          Te damos la bienvenida a la guia de instalacion para iPhone. Al seguir
                          estos pasos, aseguraras una implementacion exitosa del sistema en tu
                          campaña.
                        </p>
                      </motion.div>
                      <motion.button
                        type="button"
                        onClick={goToFirstIphoneStep}
                        whileHover={{ y: 2 }}
                        whileTap={{ scale: 0.96 }}
                        className="mx-auto mt-10 flex h-14 w-14 items-center justify-center rounded-full border border-white/26 bg-white/[0.06] text-white/88"
                        aria-label="Ir al primer paso"
                      >
                        <ChevronDownIcon size={28} />
                      </motion.button>
                    </div>
                  </section>

                  <section className="h-screen snap-start px-4 pt-24 pb-10 sm:px-10 sm:pt-24">
                    <div className="mx-auto grid h-full w-full max-w-[1240px] grid-cols-[68px_minmax(0,1fr)] gap-3 sm:grid-cols-[108px_minmax(0,1fr)] sm:gap-9">
                      <div />
                      <IphoneStepMotion active={activeIphoneStep === 0} className="h-full">
                        <div className="mx-auto flex h-full w-full max-w-[820px] flex-col items-start justify-center text-left sm:items-center sm:text-center">
                          <h4 className="w-full text-3xl font-bold tracking-[-0.02em] text-white sm:text-5xl">
                            Solicita acceso
                          </h4>

                          {!enviado ? (
                            <form
                              onSubmit={handleSubmit}
                              className="mt-7 w-full max-w-[700px] space-y-3"
                            >
                              <input
                                type="text"
                                placeholder="Nombre completo"
                                value={nombre}
                                onChange={(event) => setNombre(event.target.value)}
                                required
                                disabled={isSubmitting}
                                className="w-full rounded-xl border border-white/22 bg-white/[0.09] px-6 py-3.5 text-base text-white placeholder:text-white/45 focus:border-white/42 focus:outline-none sm:text-lg"
                              />
                              <input
                                type="email"
                                placeholder="Correo del Apple ID"
                                value={correo}
                                onChange={(event) => setCorreo(event.target.value)}
                                required
                                disabled={isSubmitting}
                                className="w-full rounded-xl border border-white/22 bg-white/[0.09] px-6 py-3.5 text-base text-white placeholder:text-white/45 focus:border-white/42 focus:outline-none sm:text-lg"
                              />
                              <motion.button
                                type="submit"
                                disabled={isSubmitting}
                                whileHover={isSubmitting ? undefined : { y: -2, scale: 1.01 }}
                                whileTap={isSubmitting ? undefined : { scale: 0.985 }}
                                animate={
                                  isSubmitting
                                    ? {
                                        scale: [1, 1.02, 1],
                                        boxShadow: [
                                          "0 0 0 rgba(245,197,66,0)",
                                          "0 0 26px rgba(245,197,66,0.65)",
                                          "0 0 0 rgba(245,197,66,0)",
                                        ],
                                      }
                                    : { scale: 1, boxShadow: "0 0 0 rgba(245,197,66,0)" }
                                }
                                transition={{
                                  duration: isSubmitting ? 0.72 : 0.22,
                                  ease: [0.22, 1, 0.36, 1],
                                }}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--goberna-gold)] px-5 py-3 text-base font-bold text-white transition-all duration-200 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-80 sm:px-6 sm:py-3.5 sm:text-2xl"
                              >
                                <motion.span
                                  animate={
                                    isSubmitting
                                      ? { x: [0, 3, 0], y: [0, -2, 0], rotate: [0, 20, 0] }
                                      : { x: 0, y: 0, rotate: 0 }
                                  }
                                  transition={{ duration: 0.45, repeat: isSubmitting ? Infinity : 0 }}
                                  className="flex items-center"
                                >
                                  <SendIcon size={17} />
                                </motion.span>
                                <span>{isSubmitting ? "Enviando..." : "Enviar solicitud"}</span>
                              </motion.button>
                            </form>
                          ) : (
                            <div className="mt-8 w-full rounded-xl border border-emerald-400/40 bg-emerald-400/12 px-5 py-4 text-base text-emerald-300 sm:w-auto">
                              Solicitud enviada. Te habilitaremos por TestFlight.
                            </div>
                          )}

                          <p className="mt-8 max-w-[780px] text-base leading-relaxed text-white/82 sm:mx-auto">
                            En este apartado debes ingresar los datos de tu cuenta de Apple para
                            poder otorgarte acceso a la aplicacion. Tu informacion sera cifrada
                            para garantizar su seguridad y evitar cualquier riesgo.
                          </p>
                        </div>
                      </IphoneStepMotion>
                    </div>
                  </section>

                  <section className="h-screen snap-start px-4 pt-24 pb-10 sm:px-10 sm:pt-24">
                    <div className="mx-auto grid h-full w-full max-w-[1240px] grid-cols-[68px_minmax(0,1fr)] gap-3 sm:grid-cols-[108px_minmax(0,1fr)] sm:gap-9">
                      <div />
                      <IphoneStepMotion active={activeIphoneStep === 1} className="h-full">
                        <div className="mx-auto flex h-full w-full max-w-[1120px] flex-col justify-center gap-5 lg:grid lg:grid-cols-[minmax(0,1.22fr)_minmax(0,0.78fr)] lg:items-center lg:gap-8">
                          <div className="w-full max-w-[300px] sm:max-w-[420px] lg:max-w-none">
                            <Image
                              src={TESTFLIGHT_SCREENSHOT_SRC}
                              alt="Pantalla de TestFlight en App Store"
                              width={1284}
                              height={1054}
                              className="w-full rounded-[24px] border border-white/16 shadow-[0_18px_36px_rgba(0,0,0,0.42)] sm:rounded-[30px] sm:shadow-[0_22px_46px_rgba(0,0,0,0.45)]"
                              unoptimized
                            />
                          </div>

                          <div className="w-full max-w-sm text-left lg:text-left">
                            <p className="text-3xl font-bold leading-tight text-white sm:text-[40px]">
                              Descarga TestFlight
                            </p>
                            <p className="mt-3 text-base leading-relaxed text-white/83 sm:mt-5 sm:text-xl">
                              En este paso deberas descargar TestFlight en tu appstore para poder
                              acceder a la aplicacion.
                            </p>
                            <a
                              href={TESTFLIGHT_APP_URL}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-white/28 bg-white/[0.09] px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-white/[0.16] sm:mt-7 sm:px-5 sm:py-3 sm:text-2xl"
                            >
                              <AppleIcon size={20} color="#ffffff" />
                              Descarga ahora
                            </a>
                          </div>
                        </div>
                      </IphoneStepMotion>
                    </div>
                  </section>

                  <section className="h-screen snap-start px-4 pt-24 pb-10 sm:px-10 sm:pt-24">
                    <div className="mx-auto grid h-full w-full max-w-[1240px] grid-cols-[68px_minmax(0,1fr)] gap-3 sm:grid-cols-[108px_minmax(0,1fr)] sm:gap-9">
                      <div />
                      <IphoneStepMotion active={activeIphoneStep === 2} className="h-full">
                        <div className="mx-auto flex h-full w-full max-w-[1300px] flex-col justify-center gap-4 lg:grid lg:grid-cols-[minmax(0,1.36fr)_minmax(0,0.64fr)] lg:items-center lg:gap-2">
                          <div className="flex w-full justify-start lg:justify-center">
                            <Iphone17Pro
                              width={200}
                              height={400}
                              src={IPHONE_PREVIEW_SRC}
                              className="h-[44vh] w-auto text-[#0b1727] drop-shadow-[0_24px_50px_rgba(0,0,0,0.55)] md:h-[82vh] md:-translate-x-5 md:-translate-y-2"
                            />
                          </div>

                          <div className="w-full max-w-sm text-left lg:-ml-10 lg:justify-self-start lg:text-left">
                            <p className="text-3xl font-bold leading-tight text-white sm:text-[40px]">
                              Instala Goberna
                            </p>
                            <p className="mt-3 text-base leading-relaxed text-white/83 sm:mt-5 sm:text-xl">
                              A traves de esta invitacion podras acceder a TestFlight y descargar
                              la aplicacion.
                            </p>
                            <a
                              href={TESTFLIGHT_URL}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-white/28 bg-white/[0.09] px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-white/[0.16] sm:mt-5 sm:text-lg"
                            >
                              <ExternalLinkIcon size={20} />
                              Descarga desde la invitacion
                            </a>
                          </div>
                        </div>
                      </IphoneStepMotion>
                    </div>
                  </section>

                  <section className="h-screen snap-start px-6 pt-24 pb-12 sm:px-10 sm:pt-24">
                    <div className="mx-auto flex h-full w-full max-w-[1240px] items-center justify-center">
                      <div className="mx-auto max-w-3xl text-center">
                        <div className="mb-7 flex flex-col items-center">
                          <motion.div
                            initial={{ opacity: 0, y: 8, filter: "blur(10px)" }}
                            animate={
                              isIphoneThanksPanel
                                ? { opacity: 1, y: 0, filter: "blur(0px)" }
                                : { opacity: 0, y: 8, filter: "blur(10px)" }
                            }
                            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                          >
                            <Image
                              src={BRAND_ICON_SRC}
                              alt="Logo Goberna"
                              width={92}
                              height={106}
                              className="h-[84px] w-auto object-contain sm:h-[102px]"
                              unoptimized
                            />
                          </motion.div>
                          <BlurText
                            text="GOBERNA"
                            delay={34}
                            animateBy="letters"
                            direction="top"
                            className="mt-2 justify-center text-xs font-bold uppercase tracking-[0.24em] text-white/80 sm:text-sm"
                          />
                        </div>

                        <DecryptText
                          text={THANKS_TEXT}
                          active={isIphoneThanksPanel}
                          className="text-balance text-3xl font-extrabold uppercase leading-[1.08] tracking-[-0.02em] text-white sm:text-5xl"
                        />
                        <motion.p
                          initial={{ opacity: 0, y: 10 }}
                          animate={isIphoneThanksPanel ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
                          transition={{ duration: 0.45, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                          className="mx-auto mt-5 max-w-2xl text-base text-white/74 sm:text-xl"
                        >
                          Tu compromiso fortalece cada operacion en territorio.
                        </motion.p>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </motion.section>
          ) : null}
        </AnimatePresence>
      </main>
    </div>
  );
}

function FlowHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="relative mb-2 flex min-h-9 items-center justify-center">
      <button
        type="button"
        onClick={onBack}
        className="absolute left-0 inline-flex items-center gap-1 rounded-full border border-white/24 px-3 py-1.5 text-xs font-semibold text-white/82 transition-colors duration-200 hover:border-white/40 hover:text-white"
      >
        <ArrowLeftIcon size={14} />
        Volver
      </button>

      <h3 className="text-xl font-bold tracking-[-0.02em] text-white sm:text-2xl">{title}</h3>
    </div>
  );
}

function PlatformBtn({
  onClick,
  icon,
  title,
  subtitle,
  accent,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  accent: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.99 }}
      variants={staggerItem}
      className="group flex w-full cursor-pointer items-center gap-2.5 rounded-2xl border border-white/16 bg-[linear-gradient(180deg,rgba(255,255,255,0.10),rgba(255,255,255,0.05))] px-4 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] backdrop-blur-md transition-colors duration-200 hover:border-white/34 sm:gap-3 sm:rounded-3xl sm:px-5 sm:py-4"
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border sm:h-12 sm:w-12 sm:rounded-2xl"
        style={{
          backgroundColor: `${accent}14`,
          borderColor: `${accent}4D`,
        }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-2xl font-bold leading-tight text-white sm:text-3xl">{title}</p>
        <p className="text-xs text-white/42 sm:text-sm">{subtitle}</p>
      </div>
      <ArrowRightIcon
        size={16}
        className="shrink-0 text-white/35 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-white/72"
      />
    </motion.button>
  );
}

function IphoneStepper({
  activeStep,
  progress,
}: {
  activeStep: number;
  progress: number;
}) {
  const safeStep = Math.max(1, Math.min(IPHONE_STEPS.length, activeStep));
  const fillTop = Math.max(0, 50 - progress * 50);

  return (
    <aside className="relative h-full overflow-visible">
      <div className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-white/20" />

      <motion.div
        className="absolute left-1/2 bottom-0 w-px -translate-x-1/2 bg-[var(--goberna-gold)] shadow-[0_0_8px_rgba(245,197,66,0.34)] sm:shadow-[0_0_15px_rgba(245,197,66,0.72)]"
        animate={{ top: `${fillTop}%` }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      />

      <AnimatePresence mode="wait">
        <motion.div
          key={safeStep}
          initial={{ scale: 0.72, opacity: 0, x: -10 }}
          animate={{ scale: 1, opacity: 1, x: 0 }}
          exit={{ scale: 0.8, opacity: 0, x: 10 }}
          transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--goberna-gold)] text-xl font-extrabold text-white shadow-[0_0_14px_rgba(245,197,66,0.42)] sm:h-14 sm:w-14 sm:text-4xl sm:shadow-[0_0_28px_rgba(245,197,66,0.82)]"
        >
          {safeStep}
        </motion.div>
      </AnimatePresence>
    </aside>
  );
}

function IphoneStepMotion({
  active,
  className,
  children,
}: {
  active: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      animate={{
        scale: active ? 1 : 0.92,
        opacity: active ? 1 : 0.6,
        y: active ? 0 : 18,
      }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function ChevronDownIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function ArrowLeftIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ArrowRightIcon({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function ExternalLinkIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 17 17 7" />
      <path d="M7 7h10v10" />
    </svg>
  );
}

function SendIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 2 11 13" />
      <path d="m22 2-7 20-4-9-9-4Z" />
    </svg>
  );
}

function DecryptText({
  text,
  active,
  className,
}: {
  text: string;
  active: boolean;
  className?: string;
}) {
  const [displayText, setDisplayText] = useState("");

  useEffect(() => {
    if (!active) return;

    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@$%&*";
    let frame = 0;
    const frameLimit = text.length + 16;

    const interval = window.setInterval(() => {
      frame += 1;
      const revealCount = Math.floor((frame / frameLimit) * text.length);

      const next = text
        .split("")
        .map((char, index) => {
          if (char === " ") return " ";
          if (index < revealCount) return char;
          return alphabet[Math.floor(Math.random() * alphabet.length)];
        })
        .join("");

      setDisplayText(next);

      if (revealCount >= text.length) {
        setDisplayText(text);
        window.clearInterval(interval);
      }
    }, 42);

    return () => window.clearInterval(interval);
  }, [active, text]);

  return <p className={className}>{active ? displayText : text}</p>;
}

function PlayStoreIcon({
  size = 24,
}: {
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28.99 31.99"
      fill="none"
      role="img"
      aria-label="Google Play"
      className="shrink-0"
    >
      <title>Google Play</title>
      <path
        d="M13.54 15.28 0.12 29.34a3.66 3.66 0 0 0 5.33 2.16l15.1-8.6Z"
        fill="#EA4335"
      />
      <path
        d="m27.11 12.89-6.53-3.74-7.35 6.45 7.38 7.28 6.48-3.7a3.54 3.54 0 0 0 1.5-4.79 3.62 3.62 0 0 0-1.5-1.5Z"
        fill="#FBBC04"
      />
      <path
        d="M0.12 2.66a3.57 3.57 0 0 0-0.12 0.92v24.84a3.57 3.57 0 0 0 0.12 0.92L14 15.64Z"
        fill="#4285F4"
      />
      <path
        d="m13.64 16 6.94-6.85L5.5 0.51A3.73 3.73 0 0 0 3.63 0 3.64 3.64 0 0 0 0.12 2.65Z"
        fill="#34A853"
      />
    </svg>
  );
}

function AndroidIcon({
  size = 24,
  color = "#3DDC84",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" role="img" aria-label="Android">
      <title>Android</title>
      <path d="M7.25 9.1h9.5a1.25 1.25 0 0 1 1.25 1.25v6.15A1.25 1.25 0 0 1 16.75 17.75h-9.5A1.25 1.25 0 0 1 6 16.5v-6.15A1.25 1.25 0 0 1 7.25 9.1Z" fill={color} />
      <circle cx="9.6" cy="12.25" r="0.55" fill="#0B1220" />
      <circle cx="14.4" cy="12.25" r="0.55" fill="#0B1220" />
      <rect x="8.45" y="17.75" width="1.7" height="3.1" rx="0.85" fill={color} />
      <rect x="13.85" y="17.75" width="1.7" height="3.1" rx="0.85" fill={color} />
      <path d="M8.2 9.1a3.8 3.8 0 0 1 7.6 0h-7.6Z" fill={color} />
      <path d="M8.85 6.35 7.6 4.65" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <path d="m15.15 6.35 1.25-1.7" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <rect x="4.25" y="10.1" width="1.5" height="5.15" rx="0.75" fill={color} />
      <rect x="18.25" y="10.1" width="1.5" height="5.15" rx="0.75" fill={color} />
    </svg>
  );
}

function AppleIcon({
  size = 24,
  color = "#ffffff",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      role="img"
      aria-label="Apple"
    >
      <title>Apple</title>
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09ZM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25Z" />
    </svg>
  );
}

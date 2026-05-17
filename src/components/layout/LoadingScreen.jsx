import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useBranding } from "@/hooks/use-branding";

const LOADING_STEPS = [
  { text: "Carregando agendamentos...", duration: 800 },
  { text: "Organizando informações...", duration: 1000 },
  { text: "Tudo certo!", duration: 600 },
];

const BAR_VARIANTS = {
  idle: (index) => ({
    scaleY: [0.55, 1, 0.65, 0.92, 0.58],
    opacity: [0.55, 1, 0.8, 1, 0.6],
    transition: {
      duration: 1.05,
      repeat: Infinity,
      ease: "easeInOut",
      delay: index * 0.07,
    },
  }),
  complete: (index) => ({
    scaleY: 0.45 + index * 0.03,
    opacity: 0.35,
    transition: {
      duration: 0.25,
      ease: "easeOut",
    },
  }),
};

export default function LoadingScreen({ onComplete }) {
  const { companyName, logoUrl, isResolved } = useBranding({ variant: "base", updateDocument: false });
  const [currentStep, setCurrentStep] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const showLogo = Boolean(isResolved && logoUrl);
  const shouldAutoComplete = typeof onComplete === "function";

  useEffect(() => {
    const totalDuration = LOADING_STEPS.reduce((acc, step) => acc + step.duration, 0);
    let elapsed = 0;

    const interval = setInterval(() => {
      elapsed += 50;

      let stepTime = 0;
      for (let i = 0; i < LOADING_STEPS.length; i += 1) {
        stepTime += LOADING_STEPS[i].duration;
        if (elapsed < stepTime) {
          setCurrentStep(i);
          break;
        }
      }

      if (!shouldAutoComplete && elapsed >= totalDuration) {
        elapsed = 0;
        setCurrentStep(0);
        return;
      }

      if (shouldAutoComplete && elapsed >= totalDuration) {
        clearInterval(interval);
        setCurrentStep(LOADING_STEPS.length - 1);
        setIsComplete(true);
        setTimeout(() => {
          onComplete?.();
        }, 320);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [onComplete, shouldAutoComplete]);

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-white"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="flex flex-col items-center px-6 text-center">
        {showLogo ? (
          <motion.img
            src={logoUrl}
            alt={companyName}
            className="mb-8 h-16 w-16 object-contain sm:h-20 sm:w-20"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
          />
        ) : (
          <motion.div
            className="mb-8 h-16 w-16 rounded-3xl border border-slate-200 bg-white shadow-sm sm:h-20 sm:w-20"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
          />
        )}

        <motion.div
          className="mb-5 flex h-14 items-end justify-center gap-1.5 sm:h-16 sm:gap-2"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08 }}
        >
          {[0, 1, 2, 3, 4, 5, 6].map((index) => (
            <motion.span
              key={index}
              custom={index}
              variants={BAR_VARIANTS}
              animate={isComplete ? "complete" : "idle"}
              className="block w-1.5 origin-bottom rounded-full bg-gradient-to-t from-fuchsia-500 via-violet-500 to-pink-400 shadow-[0_0_18px_rgba(168,85,247,0.18)] sm:w-2"
              style={{
                height: `${24 + (index % 4) * 7 + (index === 3 ? 10 : 0)}px`,
              }}
            />
          ))}
        </motion.div>

        <motion.p
          className="text-[10px] font-semibold uppercase tracking-[0.38em] text-slate-500 sm:text-[11px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35, delay: 0.16 }}
        >
          Loading
        </motion.p>

        <motion.p
          key={currentStep}
          className="mt-3 text-sm text-slate-500"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          {LOADING_STEPS[currentStep]?.text}
        </motion.p>
      </div>
    </motion.div>
  );
}

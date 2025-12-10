import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";

const LOADING_STEPS = [
  { text: "Carregando agendamentos...", duration: 800 },
  { text: "Organizando informações...", duration: 1000 },
  { text: "Tudo certo!", duration: 600 }
];

export default function LoadingScreen({ onComplete }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    let totalDuration = LOADING_STEPS.reduce((acc, step) => acc + step.duration, 0);
    let elapsed = 0;

    const interval = setInterval(() => {
      elapsed += 50;
      const newProgress = Math.min((elapsed / totalDuration) * 100, 100);
      setProgress(newProgress);

      // Update step based on elapsed time
      let stepTime = 0;
      for (let i = 0; i < LOADING_STEPS.length; i++) {
        stepTime += LOADING_STEPS[i].duration;
        if (elapsed < stepTime) {
          setCurrentStep(i);
          break;
        }
      }

      if (elapsed >= totalDuration) {
        clearInterval(interval);
        setIsComplete(true);
        setTimeout(() => {
          onComplete?.();
        }, 800);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [onComplete]);

  return (
    <motion.div 
      className="fixed inset-0 bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center z-[100]"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex flex-col items-center">
        {/* Logo */}
        <motion.img
          src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68d30bcc5ca43f0f9b7df581/b25f6333e_Capturadetela2025-09-24192240.png"
          alt="Dog City Brasil"
          className="w-20 h-20 mb-8"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
        />

        {/* Progress bar container */}
        <div className="relative w-64 h-1.5 mb-6">
          <AnimatePresence mode="wait">
            {!isComplete ? (
              <motion.div
                key="progress"
                className="w-full h-full bg-slate-200 rounded-full overflow-hidden"
                exit={{ 
                  width: 0,
                  x: 128,
                  opacity: 0
                }}
                transition={{ duration: 0.4 }}
              >
                <motion.div
                  className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full"
                  style={{ width: `${progress}%` }}
                  transition={{ duration: 0.1 }}
                />
              </motion.div>
            ) : (
              <motion.div
                key="check"
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ 
                  type: "spring",
                  stiffness: 300,
                  damping: 20,
                  delay: 0.2
                }}
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                  <Check className="w-5 h-5 text-white" strokeWidth={3} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Loading text */}
        <AnimatePresence mode="wait">
          <motion.p
            key={currentStep}
            className="text-slate-600 text-sm font-medium"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            {LOADING_STEPS[currentStep]?.text}
          </motion.p>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
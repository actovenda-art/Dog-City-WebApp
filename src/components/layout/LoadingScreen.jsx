import React from "react";
import { motion, useReducedMotion } from "framer-motion";

const LOADER_LOGO = "/dog-city-loading-logo.png";

export default function LoadingScreen() {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      role="status"
      aria-live="polite"
      aria-label="Carregando página"
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_center,_#ffffff_0%,_#f8fafc_58%,_#eef2f7_100%)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="relative flex flex-col items-center">
        <div className="relative h-28 w-28 sm:h-32 sm:w-32" style={{ perspective: "900px" }}>
          <motion.div
            className="relative h-full w-full"
            style={{ transformStyle: "preserve-3d" }}
            animate={reduceMotion ? { scale: [0.96, 1.02, 0.96] } : { rotateY: [0, -360] }}
            transition={{
              duration: reduceMotion ? 1.4 : 1.65,
              ease: "linear",
              repeat: Infinity,
            }}
          >
            <img
              src={LOADER_LOGO}
              alt=""
              className="absolute inset-0 h-full w-full rounded-full object-contain drop-shadow-[0_12px_22px_rgba(15,23,42,0.16)]"
              style={{ backfaceVisibility: "hidden" }}
            />
            {!reduceMotion ? (
              <img
                src={LOADER_LOGO}
                alt=""
                className="absolute inset-0 h-full w-full rounded-full object-contain drop-shadow-[0_12px_22px_rgba(15,23,42,0.16)]"
                style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
              />
            ) : null}
          </motion.div>
        </div>

        <motion.div
          className="mt-4 h-1.5 w-16 rounded-full bg-slate-300/70 blur-[1px]"
          animate={{ scaleX: [1, 0.55, 1], opacity: [0.45, 0.2, 0.45] }}
          transition={{ duration: 0.825, ease: "easeInOut", repeat: Infinity }}
        />
        <span className="sr-only">Carregando...</span>
      </div>
    </motion.div>
  );
}

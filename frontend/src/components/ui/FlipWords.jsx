import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export default function FlipWords({ words, duration = 3000, className = "" }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % words.length);
    }, duration);
    return () => clearInterval(interval);
  }, [words.length, duration]);

  const currentWord = words[index];

  return (
    <div className={`relative inline-block ${className}`}>
      <AnimatePresence mode="wait">
        <motion.span
          key={currentWord}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.4, type: "spring", stiffness: 100, damping: 10 }}
          className="inline-block whitespace-nowrap"
        >
          {currentWord}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

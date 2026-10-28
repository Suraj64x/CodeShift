"use client";

import type { ReactNode } from "react";
import { MotionConfig, motion } from "framer-motion";

/**
 * Fades its content up once as it scrolls into view. Always renders the same
 * element on server and client (branching on the reduced-motion preference
 * caused a hydration mismatch that left sections invisible); MotionConfig
 * drops the slide for reduced-motion users and keeps a plain fade.
 */
export default function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        className={className}
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}

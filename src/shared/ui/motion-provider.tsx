import { LazyMotion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { spring } from "./motion";

const loadFeatures = () => import("./motion-features").then(r => r.default);

/** Wrap the app once. Motion's features load in a separate chunk, and transform/layout
    animations turn off for people who ask for reduced motion (opacity fades stay). */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user" transition={spring.snappy}>{children}</MotionConfig>
    </LazyMotion>
  );
}

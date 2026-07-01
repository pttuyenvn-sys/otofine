"use client";

import { useEffect, useRef, useState } from "react";

interface UseRevealOptions {
  /** Stagger delay in ms when used with index */
  delay?: number;
  /** Run once on mount without waiting for intersection */
  immediate?: boolean;
  threshold?: number;
}

/**
 * Reveal on scroll (or immediately for above-the-fold hero).
 * Respects prefers-reduced-motion via CSS companion classes.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(
  options: UseRevealOptions = {},
) {
  const { delay = 0, immediate = false, threshold = 0.12 } = options;
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(immediate);

  useEffect(() => {
    if (immediate) {
      const t = window.setTimeout(() => setVisible(true), delay);
      return () => window.clearTimeout(t);
    }

    const node = ref.current;
    if (!node) return;

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          window.setTimeout(() => setVisible(true), delay);
          observer.disconnect();
        }
      },
      { threshold },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [delay, immediate, threshold]);

  return { ref, visible };
}

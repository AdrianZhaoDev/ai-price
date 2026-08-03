"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";

type ChangeBadgeProps = {
  label: string;
  tone: "positive" | "negative" | "info";
  ariaLabel: string;
  details: string[];
  className?: string;
};

export function ChangeBadge({
  label,
  tone,
  ariaLabel,
  details,
  className = "",
}: ChangeBadgeProps) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const tooltipId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <span
      ref={rootRef}
      className={`change-badge-wrap ${className}`.trim()}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="change-badge"
        data-tone={tone}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {label}
      </button>
      <AnimatePresence>
        {open ? (
          <motion.span
            id={tooltipId}
            className="change-tooltip"
            role="tooltip"
            initial={reduceMotion ? false : { opacity: 0, y: 3, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 2, scale: 0.99 }}
            transition={{ duration: reduceMotion ? 0 : 0.14 }}
          >
            {details.map((detail) => (
              <span key={detail}>{detail}</span>
            ))}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}

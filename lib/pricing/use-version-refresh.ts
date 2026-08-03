"use client";

import type { PriceMode } from "@/lib/pricing/types";
import { useEffect } from "react";

export const VERSION_CHECK_INTERVAL_MS = 15 * 60 * 1000;

type UseVersionRefreshOptions = {
  mode: PriceMode;
  dataVersion: string | null;
  onVersionChange: () => void;
  intervalMs?: number;
};

export function useVersionRefresh({
  mode,
  dataVersion,
  onVersionChange,
  intervalMs = VERSION_CHECK_INTERVAL_MS,
}: UseVersionRefreshOptions) {
  useEffect(() => {
    let stopped = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let lastCheckAt = Date.now();

    const clearTimer = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
    };

    const isVisible = () => document.visibilityState !== "hidden";

    const schedule = () => {
      clearTimer();
      if (stopped || !isVisible()) return;
      const remaining = Math.max(0, intervalMs - (Date.now() - lastCheckAt));
      timer = setTimeout(() => void checkVersion(), remaining);
    };

    const checkVersion = async () => {
      if (stopped || inFlight || !isVisible()) return;
      inFlight = true;
      lastCheckAt = Date.now();
      controller = new AbortController();
      try {
        const response = await fetch(
          `/api/pricing/version?mode=${encodeURIComponent(mode)}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) return;
        const payload = (await response.json()) as {
          version?: string | null;
        };
        if (!stopped && (payload.version ?? null) !== dataVersion) {
          onVersionChange();
        }
      } catch {
        // A transient or aborted version check must not interrupt browsing.
      } finally {
        inFlight = false;
        controller = undefined;
        schedule();
      }
    };

    const checkIfDue = () => {
      if (!isVisible()) {
        clearTimer();
        controller?.abort();
        return;
      }
      if (Date.now() - lastCheckAt >= intervalMs) {
        void checkVersion();
      } else {
        schedule();
      }
    };

    document.addEventListener("visibilitychange", checkIfDue);
    window.addEventListener("focus", checkIfDue);
    schedule();

    return () => {
      stopped = true;
      clearTimer();
      controller?.abort();
      document.removeEventListener("visibilitychange", checkIfDue);
      window.removeEventListener("focus", checkIfDue);
    };
  }, [dataVersion, intervalMs, mode, onVersionChange]);
}

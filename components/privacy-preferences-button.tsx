"use client";

import { useEffect, useState } from "react";

export function PrivacyPreferencesButton({ label }: { label: string }) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const refresh = () => setAvailable(Boolean(window.zaraz?.showConsentModal));
    refresh();
    document.addEventListener("zarazConsentAPIReady", refresh);
    return () => document.removeEventListener("zarazConsentAPIReady", refresh);
  }, []);

  if (!available) return null;

  return (
    <button
      type="button"
      className="footer-preferences-button"
      onClick={() => window.zaraz?.showConsentModal?.()}
    >
      {label}
    </button>
  );
}

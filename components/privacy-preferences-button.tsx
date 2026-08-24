"use client";

export function PrivacyPreferencesButton({ label }: { label: string }) {
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

"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { DEFAULT_LOCALE, getMessages, type Locale } from "@/lib/i18n";

type ThemeName = "atelier" | "midnight";

export function ThemeToggle({ locale = DEFAULT_LOCALE }: { locale?: Locale }) {
  const theme = useSyncExternalStore<ThemeName>(
    (onStoreChange) => {
      window.addEventListener("storage", onStoreChange);
      window.addEventListener("ai-price-theme-change", onStoreChange);
      return () => {
        window.removeEventListener("storage", onStoreChange);
        window.removeEventListener("ai-price-theme-change", onStoreChange);
      };
    },
    () =>
      window.localStorage.getItem("ai-price-theme") === "midnight"
        ? "midnight"
        : "atelier",
    () => "atelier",
  );

  function toggleTheme() {
    const nextTheme: ThemeName = theme === "atelier" ? "midnight" : "atelier";
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("ai-price-theme", nextTheme);
    window.dispatchEvent(new Event("ai-price-theme-change"));
  }

  const messages = getMessages(locale);
  const nextThemeLabel =
    theme === "atelier"
      ? messages.common.themeDark
      : messages.common.themeLight;

  return (
    <button
      type="button"
      className="icon-button pressable"
      onClick={toggleTheme}
      aria-label={nextThemeLabel}
      title={nextThemeLabel}
    >
      {theme === "atelier" ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  );
}

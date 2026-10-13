import { useCallback, useEffect, useState } from "react";

// Device-level display preferences. index.html applies them before first paint.
export type ThemeChoice = "system" | "light" | "dark";
export type TextSize = "standard" | "large" | "largest";

const THEME_KEY = "stoga-theme";
const TEXT_KEY = "stoga-text-size";
const EVENT = "stoga-preferences";

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return allowed.includes(v as T) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage blocked: the choice still applies for this visit */
  }
}

function usePreference<T extends string>(key: string, allowed: readonly T[], fallback: T, apply: (v: T) => void) {
  const [value, setValue] = useState<T>(() => read(key, allowed, fallback));

  useEffect(() => {
    const sync = () => setValue(read(key, allowed, fallback));
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [key, allowed, fallback]);

  const set = useCallback(
    (next: T) => {
      apply(next);
      write(key, next === fallback ? null : next);
      setValue(next);
      window.dispatchEvent(new Event(EVENT));
    },
    [key, fallback, apply],
  );

  return [value, set] as const;
}

const THEMES = ["system", "light", "dark"] as const;
const SIZES = ["standard", "large", "largest"] as const;

const applyTheme = (t: ThemeChoice) => {
  if (t === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
};
const applyText = (s: TextSize) => {
  if (s === "standard") document.documentElement.removeAttribute("data-text");
  else document.documentElement.setAttribute("data-text", s);
};

export const useTheme = () => usePreference<ThemeChoice>(THEME_KEY, THEMES, "system", applyTheme);
export const useTextSize = () => usePreference<TextSize>(TEXT_KEY, SIZES, "standard", applyText);

export const THEME_LABEL: Record<ThemeChoice, string> = { system: "Match device", light: "Light", dark: "Dark" };
export const TEXT_LABEL: Record<TextSize, string> = { standard: "Standard", large: "Large", largest: "Largest" };

// How many cards a review session holds. Remembered on this device.
export type SessionSize = "10" | "20" | "all";
const SESSION_SIZES = ["10", "20", "all"] as const;
export const useSessionSize = () => usePreference<SessionSize>("stoga-session-size", SESSION_SIZES, "20", () => {});
export const SESSION_LABEL: Record<SessionSize, string> = { "10": "10 cards", "20": "20 cards", all: "All due" };
/** The ?size= of a review link as a number of cards, or null for all. */
export const sizeParam = (v: string | null) => (v === "10" || v === "20" ? Number(v) : null);

// How typed answers are checked: by the AI, or by the student against the answer. This device only.
export type Grading = "ai" | "self";
export const useGrading = () => usePreference<Grading>("stoga-grading", ["ai", "self"] as const, "ai", () => {});

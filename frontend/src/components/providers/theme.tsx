"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";

import { useMediaQuery, useStoredValue } from "@/lib/storage";

export type ThemeChoice = "dark" | "light" | "system";
const STORAGE_KEY = "reelforge-theme";

// Runs before React hydrates so the page never flashes the wrong theme.
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}")||"dark";var r=t==="system"?(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):t;document.documentElement.dataset.theme=r;}catch(e){document.documentElement.dataset.theme="dark";}})();`;

interface ThemeContextValue {
  choice: ThemeChoice;
  resolved: "dark" | "light";
  setChoice: (choice: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useStoredValue(STORAGE_KEY, "dark");
  const choice: ThemeChoice = stored === "light" || stored === "system" ? stored : "dark";
  const systemLight = useMediaQuery("(prefers-color-scheme: light)");
  const resolved = choice === "system" ? (systemLight ? "light" : "dark") : choice;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  return (
    <ThemeContext.Provider value={{ choice, resolved, setChoice: setStored }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}

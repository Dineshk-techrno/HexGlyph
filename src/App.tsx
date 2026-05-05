import { useState, useEffect } from "react";
import Home from "@/pages/home";
import { Moon, Sun } from "lucide-react";

export default function App() {
  const [dark, setDark] = useState<boolean>(() => {
    // Persist preference in localStorage
    const saved = localStorage.getItem("hg-theme");
    if (saved) return saved === "dark";
    // System preference fallback
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("hg-theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <>
      {/* ── Theme toggle — fixed top-right corner ── */}
      <button
        onClick={() => setDark(d => !d)}
        aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
        title={dark ? "Light mode" : "Dark mode"}
        className="
          fixed top-4 right-4 z-50
          w-10 h-10 flex items-center justify-center rounded-full
          border transition-all duration-200
          bg-background border-border
          text-foreground hover:scale-110
          shadow-lg
        "
      >
        {dark
          ? <Sun  className="w-4 h-4 text-yellow-400" />
          : <Moon className="w-4 h-4 text-slate-500"  />
        }
      </button>

      <Home />
    </>
  );
}

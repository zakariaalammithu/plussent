"use client";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<string | null>(null);
  useEffect(() => {
    setTheme(document.documentElement.getAttribute("data-theme") || "system");
  }, []);
  function apply(next: string) {
    if (next === "system") {
      document.documentElement.removeAttribute("data-theme");
      localStorage.removeItem("plasesent-theme");
    } else {
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("plasesent-theme", next);
    }
    setTheme(next);
  }
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button type="button" className="btn btn-secondary btn-sm" onClick={() => apply(next)} aria-label="Toggle light/dark theme">
      {theme === "dark" ? "Light mode" : "Dark mode"}
    </button>
  );
}

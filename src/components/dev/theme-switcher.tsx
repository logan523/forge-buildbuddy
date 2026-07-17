"use client";

import { useEffect, useState } from "react";

/**
 * Dev-only theme switcher. layout.tsx mounts this behind a NODE_ENV guard,
 * so it never has to check the environment itself — if it's on the page,
 * we're in dev.
 */

type ThemeId = "blueprint-evolved" | "field-notebook" | "kit-box";

const THEME_IDS: ThemeId[] = ["blueprint-evolved", "field-notebook", "kit-box"];

const THEME_OPTIONS: { id: ThemeId | null; label: string }[] = [
  { id: null, label: "Incumbent" },
  { id: "blueprint-evolved", label: "Blueprint+" },
  { id: "field-notebook", label: "Notebook" },
  { id: "kit-box", label: "Kit-Box" },
];

const STORAGE_KEY = "forge-theme-dev";

function isThemeId(value: string | null): value is ThemeId {
  return value !== null && (THEME_IDS as string[]).includes(value);
}

function applyTheme(id: ThemeId | null) {
  // Incumbent has no data-theme attribute at all — removing it (rather than
  // writing some "incumbent" sentinel) is what makes every [data-theme="x"]
  // override block in src/app/themes/ inert.
  if (id === null) {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.dataset.theme = id;
  }
}

export function ThemeSwitcher() {
  // Server render and the first client render must match exactly — this
  // stays null until an effect confirms we're mounted, so location/
  // localStorage are only ever read after hydration.
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState<ThemeId | null>(null);

  useEffect(() => {
    const fromQuery = new URLSearchParams(location.search).get("theme");
    const fromStorage = localStorage.getItem(STORAGE_KEY);
    const initial = isThemeId(fromQuery) ? fromQuery : isThemeId(fromStorage) ? fromStorage : null;

    // location/localStorage don't exist during SSR, so the resolved theme
    // can only be known once mounted — same constraint the stage/** files
    // carve this rule out for, just scoped to the one read here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActive(initial);
    applyTheme(initial);
    setMounted(true);
  }, []);

  function select(id: ThemeId | null) {
    setActive(id);
    applyTheme(id);

    if (id === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, id);
    }

    const url = new URL(location.href);
    if (id === null) {
      url.searchParams.delete("theme");
    } else {
      url.searchParams.set("theme", id);
    }
    history.replaceState(null, "", url.toString());
  }

  if (!mounted) return null;

  return (
    <div
      role="group"
      aria-label="Dev theme switcher"
      // bottom-16, not bottom-4: Next's own dev-tools indicator (also
      // bottom-left, unconfigured) sits in the 0-54px corner — clearing it
      // keeps both dev-only affordances independently clickable.
      className="fixed bottom-16 left-4 z-[100] flex items-center gap-0.5 rounded-full border border-console-border bg-console-overlay p-1 shadow-console backdrop-blur-sm"
    >
      {THEME_OPTIONS.map(({ id, label }) => (
        <button
          key={id ?? "incumbent"}
          type="button"
          aria-pressed={active === id}
          onClick={() => select(id)}
          className={`rounded-full px-2.5 py-1 text-2xs font-medium tracking-wide transition-colors cursor-pointer ${
            active === id
              ? "bg-console-accent text-console-bg"
              : "text-console-text-muted hover:text-console-text"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

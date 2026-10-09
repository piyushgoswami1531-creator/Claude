import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { BarChart3, CalendarDays, Gavel, Moon, Sun, Sunrise } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { NavLink } from "react-router";
import { api } from "../lib/api";
import { AccountMenu } from "./AccountMenu";
import { IS_ARTIFACT } from "../lib/env";

const NAV = [
  { to: "/today", label: "Today", icon: Sunrise },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/dashboard", label: "Progress", icon: BarChart3 },
  { to: "/review", label: "Review", icon: Gavel },
];

function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? "light");
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("sf-theme", theme);
    } catch {
      /* private mode */
    }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))] as const;
}

export function ThemeToggle() {
  // In the Claude app the viewer's own theme setting drives light/dark.
  return IS_ARTIFACT ? null : <ThemeToggleButton />;
}

function ThemeToggleButton() {
  const [theme, toggle] = useTheme();
  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className="grid size-10 place-items-center rounded-full border border-line bg-surface text-ink-2 transition hover:text-ink"
    >
      <motion.span key={theme} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} transition={{ duration: 0.3 }}>
        {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </motion.span>
    </button>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <span className="grid size-8 place-items-center rounded-lg bg-[#16161d] ring-1 ring-white/10">
        <svg viewBox="0 0 32 32" className="size-5">
          <path d="M7 17.5l5.5 5.5L25 10" fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="font-display text-2xl leading-none">StudyFlow</span>
    </span>
  );
}

export function AiBadge() {
  const { data } = useQuery({ queryKey: ["health"], queryFn: api.health, staleTime: Infinity });
  if (!data) return null;
  return data.ai_mode === "live" ? null : (
    <span title={IS_ARTIFACT ? "Claude isn't available here, so quizzes and reviews use offline demo logic." : "No ANTHROPIC_API_KEY set: AI features use offline demo logic."} className="inline-block rounded-full border border-warn/50 px-2.5 py-1 text-xs font-semibold text-warn">
      Demo AI
    </span>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh overflow-x-clip md:pl-60">
      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-surface/70 p-5 backdrop-blur md:flex">
        <Logo />
        <nav className="mt-10 flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className="relative">
              {({ isActive }) => (
                <span className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? "text-paper" : "text-ink-2 hover:text-ink"}`}>
                  {isActive && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-xl bg-ink" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
                  <Icon className="relative size-4" />
                  <span className="relative">{label}</span>
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          <AiBadge />
          <div className="flex items-center justify-between gap-2">
            <AccountMenu placement="up" />
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="sticky top-[env(safe-area-inset-top,0px)] z-30 flex items-center justify-between border-b border-line bg-paper/85 px-4 py-3 backdrop-blur md:hidden">
        <Logo />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <AccountMenu placement="down" />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-6 pb-28 sm:px-6 md:pt-10 md:pb-12">{children}</main>

      {/* Mobile tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium">
            {({ isActive }) => (
              <>
                <span className="relative grid h-7 w-12 place-items-center">
                  {isActive && <motion.span layoutId="tab-pill" className="absolute inset-0 rounded-full bg-accent" />}
                  <Icon className={`relative size-4 ${isActive ? "text-accent-ink" : "text-ink-3"}`} />
                </span>
                <span className={isActive ? "text-ink" : "text-ink-3"}>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type Toast = { id: number; text: string; kind: "success" | "error" };
const Ctx = createContext<(text: string, kind?: Toast["kind"]) => void>(() => {});

export const useToast = () => useContext(Ctx);

/** Short success / error messages at the bottom of the screen. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const show = useCallback((text: string, kind: Toast["kind"] = "success") => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 6000 : 3000);
  }, []);

  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[80] flex flex-col items-center gap-2 px-4" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }} aria-live="polite">
        {toasts.map((t) => (
          <p
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={`pointer-events-auto w-full max-w-md animate-fade-up rounded-2xl px-5 py-4 text-base font-medium shadow-lift ${
              t.kind === "error" ? "border border-surface-strong bg-surface text-ink-deep" : "bg-primary text-canvas"
            }`}
          >
            {t.kind === "error" ? "⚠ " : "✓ "}
            {t.text}
          </p>
        ))}
      </div>
    </Ctx.Provider>
  );
}

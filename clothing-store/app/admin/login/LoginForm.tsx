"use client";

import { useState, useTransition } from "react";
import { sendLoginCode, verifyLoginCode } from "@/app/admin/_actions/auth";

export default function LoginForm({ initialError }: { initialError?: string }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState(initialError ?? "");
  const [pending, start] = useTransition();

  const submitEmail = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    start(async () => {
      const res = await sendLoginCode(email);
      if (res.ok) setStep("code");
      else setError(res.message);
    });
  };

  const submitCode = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    start(async () => {
      // Redirects to /admin on success.
      const res = await verifyLoginCode(email, code);
      if (res && !res.ok) setError(res.message);
    });
  };

  const input = "h-14 w-full rounded-2xl border border-surface-strong bg-surface px-5 text-lg text-ink-deep placeholder:text-ink/40 focus:border-accent";
  const button = "h-14 w-full rounded-full bg-primary text-lg font-semibold text-canvas transition active:scale-[0.98] disabled:opacity-50";

  return (
    <div className="w-full max-w-sm">
      {step === "email" ? (
        <form onSubmit={submitEmail} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-base text-ink/80">Your email</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@email.com"
              className={input}
            />
          </label>
          <button type="submit" disabled={pending} className={button}>
            {pending ? "Sending…" : "Send me a code"}
          </button>
        </form>
      ) : (
        <form onSubmit={submitCode} className="space-y-4">
          <p className="text-base text-ink/80">
            We sent a 6-digit code to <strong className="text-ink-deep">{email}</strong>. Type it below.
          </p>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={7}
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            aria-label="6-digit code"
            className={`${input} text-center text-2xl tracking-[0.5em]`}
          />
          <button type="submit" disabled={pending} className={button}>
            {pending ? "Checking…" : "Log in"}
          </button>
          <button
            type="button"
            onClick={() => { setStep("email"); setCode(""); setError(""); }}
            className="h-12 w-full text-base text-ink/70 underline underline-offset-4"
          >
            Use a different email / send again
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-2xl border border-surface-strong bg-surface px-4 py-3 text-base text-ink-deep">
          {error}
        </p>
      )}
    </div>
  );
}

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, CalendarCheck2, Gavel, ListChecks } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Logo, ThemeToggle } from "../components/Layout";
import { ProgressRing } from "../components/ProgressRing";
import { Button } from "../components/ui";
import { api } from "../lib/api";
import { setSession } from "../lib/session";

type Mode = "login" | "signup";

const FEATURES = [
  { icon: CalendarCheck2, text: "A day-by-day plan that rebuilds itself when you miss a day" },
  { icon: ListChecks, text: "10-question quizzes on every topic you finish" },
  { icon: Gavel, text: "A weekly review that tells you exactly what to fix" },
];

export default function AuthPage() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = useMutation({
    mutationFn: () => (mode === "signup" ? api.signup({ name, email, password }) : api.login({ email, password })),
    onSuccess: (me) => setSession(qc, me),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit.mutate();
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    submit.reset();
  };

  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-2">
      {/* Pitch */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-ink p-12 text-paper lg:flex">
        <span className="[&_*]:!text-paper">
          <Logo />
        </span>
        <div>
          <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="font-display text-6xl leading-[1.02]">
            Your syllabus,
            <br />
            <span className="italic text-accent">actually finished.</span>
          </motion.h1>
          <ul className="mt-10 space-y-4">
            {FEATURES.map(({ icon: Icon, text }, i) => (
              <motion.li key={text} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.1 }} className="flex items-center gap-3 text-paper/80">
                <span className="grid size-9 place-items-center rounded-full bg-paper/10">
                  <Icon className="size-4" />
                </span>
                {text}
              </motion.li>
            ))}
          </ul>
        </div>
        <div className="absolute -right-16 -bottom-16 opacity-90">
          <ProgressRing value={0.72} size={320} stroke={26} color="var(--accent)" track="rgba(255,255,255,0.07)">
            <span className="num text-5xl text-paper">72%</span>
          </ProgressRing>
        </div>
        <p className="text-xs text-paper/40">Built with FastAPI, React and Claude.</p>
      </section>

      {/* Form */}
      <section className="flex flex-col px-4 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <span className="lg:invisible">
            <Logo />
          </span>
          <ThemeToggle />
        </div>

        <div className="mx-auto my-auto w-full max-w-sm py-10">
          <h2 className="font-display text-5xl leading-tight">{mode === "signup" ? "Start studying smarter." : "Welcome back."}</h2>
          <p className="mt-2 text-ink-2">{mode === "signup" ? "Free. Takes 20 seconds." : "Log in to see today's plan."}</p>

          <div className="mt-8 flex rounded-full bg-surface-2 p-1" role="tablist">
            {(["signup", "login"] as const).map((m) => (
              <button key={m} role="tab" aria-selected={mode === m} onClick={() => switchMode(m)} className="relative flex-1 rounded-full py-2 text-sm font-semibold">
                {mode === m && <motion.span layoutId="auth-tab" className="absolute inset-0 rounded-full bg-surface shadow-sm" />}
                <span className={`relative ${mode === m ? "text-ink" : "text-ink-3"}`}>{m === "signup" ? "Sign up" : "Log in"}</span>
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit} className="mt-6 space-y-3">
            <AnimatePresence initial={false}>
              {mode === "signup" && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <Field label="Name" value={name} onChange={setName} autoComplete="name" required={mode === "signup"} />
                </motion.div>
              )}
            </AnimatePresence>
            <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" required />
            <Field
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={8}
              hint={mode === "signup" ? "At least 8 characters" : undefined}
              required
            />
            {submit.error && (
              <motion.p role="alert" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0, x: [0, -6, 6, -4, 4, 0] }} className="rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">
                {submit.error.message}
              </motion.p>
            )}
            <Button type="submit" variant="accent" loading={submit.isPending} className="w-full py-3">
              {mode === "signup" ? "Create account" : "Log in"} <ArrowRight className="size-4" />
            </Button>
          </form>
        </div>
      </section>
    </div>
  );
}

function Field({ label, value, onChange, hint, ...rest }: {
  label: string; value: string; onChange: (v: string) => void; hint?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink-2">{label}</span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-ink outline-none transition focus:border-ink"
      />
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

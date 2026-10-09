import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, FileUp, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { AccountMenu } from "../components/AccountMenu";
import { AiBadge, Logo, ThemeToggle } from "../components/Layout";
import { Button, ErrorBox, Eyebrow } from "../components/ui";
import { api, type ParsedSubject, type Strength } from "../lib/api";
import { addDays, isoDate, minutes, parseDate } from "../lib/format";

const STEPS = ["Syllabus", "Check topics", "Exam & time", "Strengths"];

const SAMPLE = `Subject: Database Management Systems
Unit 1: Introduction - Data models, ER diagrams, Keys and constraints
Unit 2: Relational model - Relational algebra, Tuple calculus
Unit 3: Normalization - Functional dependencies, 1NF, 2NF, 3NF, BCNF
Unit 4: SQL - Joins, Subqueries, Views, Transactions and concurrency control

Subject: Operating Systems
Unit 1: Processes - Process states, CPU scheduling algorithms, Threads
Unit 2: Synchronization - Semaphores, Deadlocks, Banker's algorithm
Unit 3: Memory - Paging, Segmentation, Virtual memory, Page replacement`;

export default function Setup() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [subjects, setSubjects] = useState<ParsedSubject[]>([]);
  const [source, setSource] = useState<"ai" | "demo">("ai");
  const [examDate, setExamDate] = useState(isoDate(addDays(new Date(), 30)));
  const [hours, setHours] = useState(3);
  const fileRef = useRef<HTMLInputElement>(null);
  const existing = useQuery({ queryKey: ["plan"], queryFn: api.plan, retry: false });

  const go = (n: number) => {
    setDir(n > step ? 1 : -1);
    setStep(n);
  };

  const parse = useMutation({
    mutationFn: () => (file ? api.parsePdf(file) : api.parseText(text)),
    onSuccess: (res) => {
      setSubjects(res.subjects.map((s) => ({ ...s, strength: "neutral" as Strength })));
      setSource(res.source);
      go(1);
    },
  });

  const create = useMutation({
    mutationFn: () => api.createPlan({ exam_date: examDate, daily_hours: hours, subjects }),
    onSuccess: (plan) => {
      qc.setQueryData(["plan"], plan);
      qc.invalidateQueries();
      navigate("/today", { replace: true });
    },
  });

  const totalTopics = subjects.reduce((n, s) => n + s.units.reduce((m, u) => m + u.topics.length, 0), 0);
  const totalMinutes = subjects.reduce((n, s) => n + s.units.reduce((m, u) => m + u.topics.reduce((k, t) => k + t.est_minutes, 0), 0), 0);
  const daysLeft = examDate ? Math.round((parseDate(examDate).getTime() - parseDate(isoDate(new Date())).getTime()) / 86400000) : 0;
  const needPerDay = daysLeft > 0 ? Math.round((totalMinutes * 1.25) / (daysLeft * 0.75)) : 0;

  const update = (fn: (draft: ParsedSubject[]) => void) =>
    setSubjects((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next
        .map((s) => ({ ...s, units: s.units.filter((u) => u.topics.length) }))
        .filter((s) => s.units.length);
    });

  return (
    <div className="min-h-dvh overflow-x-clip">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <div className="flex items-center gap-2">
          {existing.data && (
            <Link to="/today" className="hidden rounded-full px-3 py-2 text-sm font-medium text-ink-2 hover:bg-surface-2 hover:text-ink sm:inline">
              Back to my plan
            </Link>
          )}
          <span className="hidden sm:inline"><AiBadge /></span>
          <ThemeToggle />
          <AccountMenu placement="down" />
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 pb-24 sm:px-6">
        {/* Stepper */}
        <ol className="mb-8 grid grid-cols-4 gap-2">
          {STEPS.map((s, i) => (
            <li key={s}>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <motion.div className="h-full bg-ink" initial={false} animate={{ width: i <= step ? "100%" : "0%" }} transition={{ duration: 0.4 }} />
              </div>
              <p className={`mt-2 hidden text-xs font-medium sm:block ${i <= step ? "text-ink" : "text-ink-3"}`}>
                {i + 1}. {s}
              </p>
            </li>
          ))}
        </ol>

        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            initial={{ opacity: 0, x: 40 * dir }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 * dir }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            {step === 0 && (
              <section>
                <Eyebrow>Step 1</Eyebrow>
                <h1 className="font-display text-5xl leading-[1.05] sm:text-6xl">
                  Drop in your syllabus.
                  <br />
                  <span className="italic text-ink-3">Get a plan that adapts.</span>
                </h1>
                <p className="mt-4 max-w-xl text-ink-2">
                  Paste it straight from your college portal or upload the PDF. StudyFlow splits it into subjects, units and topics, then builds a day-by-day plan to your exam.
                </p>

                <div className="card mt-8 p-2">
                  {file ? (
                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 p-4">
                      <span className="flex items-center gap-3 text-sm">
                        <FileUp className="size-5" /> {file.name}
                        <span className="text-ink-3">({Math.round(file.size / 1024)} KB)</span>
                      </span>
                      <button aria-label="Remove PDF" onClick={() => setFile(null)} className="rounded-full p-1 hover:bg-surface">
                        <X className="size-4" />
                      </button>
                    </div>
                  ) : (
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder={"Subject: DBMS\nUnit 1: Introduction - ER model, Keys\nUnit 2: Normalization - 1NF, 2NF, 3NF..."}
                      rows={11}
                      className="w-full resize-y rounded-2xl bg-transparent p-4 font-mono text-sm outline-none placeholder:text-ink-3"
                    />
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line p-2">
                    <div className="flex gap-1">
                      <input
                        ref={fileRef}
                        type="file"
                        accept="application/pdf,.pdf"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) setFile(f);
                          e.target.value = "";
                        }}
                      />
                      <Button variant="ghost" onClick={() => fileRef.current?.click()}>
                        <FileUp className="size-4" /> Upload PDF
                      </Button>
                      {!file && !text && (
                        <Button variant="ghost" onClick={() => setText(SAMPLE)}>
                          Use a sample
                        </Button>
                      )}
                    </div>
                    <Button variant="accent" loading={parse.isPending} disabled={!file && text.trim().length < 10} onClick={() => parse.mutate()}>
                      <Sparkles className="size-4" /> {parse.isPending ? "Reading syllabus…" : "Parse syllabus"}
                    </Button>
                  </div>
                </div>
                {parse.error && (
                  <div className="mt-4">
                    <ErrorBox error={parse.error} />
                  </div>
                )}
              </section>
            )}

            {step === 1 && (
              <section>
                <Eyebrow>Step 2 · {totalTopics} topics · ~{minutes(totalMinutes)} of study</Eyebrow>
                <h1 className="font-display text-4xl sm:text-5xl">Does this look right?</h1>
                <p className="mt-2 text-ink-2">
                  Rename, remove, or adjust difficulty. Harder topics get more time.
                  {source === "demo" && <span className="text-warn"> Parsed with the offline demo parser. Add an API key for smarter parsing.</span>}
                </p>
                <div className="mt-6 space-y-4">
                  {subjects.map((s, si) => (
                    <div key={si} className="card overflow-hidden">
                      <div className="flex items-center gap-3 border-b border-line bg-surface-2/60 px-4 py-3">
                        <span className="size-3 rounded-full" style={{ background: `var(--c${(si % 8) + 1})` }} />
                        <input
                          value={s.name}
                          onChange={(e) => update((d) => void (d[si].name = e.target.value))}
                          aria-label="Subject name"
                          className="min-w-0 flex-1 bg-transparent font-semibold outline-none"
                        />
                        <button aria-label={`Remove ${s.name}`} onClick={() => update((d) => void d.splice(si, 1))} className="rounded-full p-1.5 text-ink-3 hover:bg-surface hover:text-bad">
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                      <div className="divide-y divide-line">
                        {s.units.map((u, ui) => (
                          <div key={ui} className="px-4 py-3">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-3">{u.name}</p>
                            <ul className="space-y-1.5">
                              <AnimatePresence initial={false}>
                                {u.topics.map((t, ti) => (
                                  <motion.li key={`${ti}-${t.name}`} layout exit={{ opacity: 0, height: 0 }} className="flex items-center gap-2">
                                    <input
                                      value={t.name}
                                      onChange={(e) => update((d) => void (d[si].units[ui].topics[ti].name = e.target.value))}
                                      aria-label="Topic name"
                                      className="min-w-0 flex-1 rounded-lg bg-transparent px-2 py-1 text-sm outline-none hover:bg-surface-2 focus:bg-surface-2"
                                    />
                                    <DifficultyDots value={t.difficulty} onChange={(v) => update((d) => void (d[si].units[ui].topics[ti].difficulty = v))} />
                                    <span className="num hidden w-14 text-right text-xs text-ink-3 sm:inline">{minutes(t.est_minutes)}</span>
                                    <button aria-label={`Remove ${t.name}`} onClick={() => update((d) => void d[si].units[ui].topics.splice(ti, 1))} className="rounded-full p-1 text-ink-3 hover:text-bad">
                                      <X className="size-3.5" />
                                    </button>
                                  </motion.li>
                                ))}
                              </AnimatePresence>
                            </ul>
                            <button
                              onClick={() => update((d) => void d[si].units[ui].topics.push({ name: "New topic", difficulty: 3, est_minutes: 60 }))}
                              className="mt-2 flex items-center gap-1 px-2 text-xs font-medium text-ink-3 hover:text-ink"
                            >
                              <Plus className="size-3.5" /> Add topic
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <Nav onBack={() => go(0)} onNext={() => go(2)} nextDisabled={!totalTopics || subjects.some((s) => !s.name.trim())} />
              </section>
            )}

            {step === 2 && (
              <section>
                <Eyebrow>Step 3</Eyebrow>
                <h1 className="font-display text-4xl sm:text-5xl">When's the exam?</h1>
                <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="card block p-5">
                    <span className="text-sm font-medium text-ink-2">Exam date</span>
                    <input
                      type="date"
                      value={examDate}
                      min={isoDate(addDays(new Date(), 1))}
                      onChange={(e) => setExamDate(e.target.value)}
                      className="num mt-2 block w-full bg-transparent text-2xl outline-none"
                    />
                    <span className="mt-2 block text-sm text-ink-3">{daysLeft > 0 ? `${daysLeft} days from today` : "Pick a future date"}</span>
                  </label>
                  <label className="card block p-5">
                    <span className="text-sm font-medium text-ink-2">Study time per day</span>
                    <span className="num mt-2 block text-2xl">{hours} h</span>
                    <input type="range" min={0.5} max={12} step={0.5} value={hours} onChange={(e) => setHours(Number(e.target.value))} className="mt-3 w-full" />
                  </label>
                </div>
                {daysLeft > 0 && needPerDay > hours * 60 && (
                  <p className="mt-4 rounded-2xl border border-warn/40 bg-warn/10 p-4 text-sm">
                    Rough check: this syllabus needs about <b className="num">{minutes(needPerDay)}</b>/day including revision. StudyFlow will squeeze it to fit, but you'll be tight.
                  </p>
                )}
                <Nav onBack={() => go(1)} onNext={() => go(3)} nextDisabled={daysLeft < 1} />
              </section>
            )}

            {step === 3 && (
              <section>
                <Eyebrow>Step 4</Eyebrow>
                <h1 className="font-display text-4xl sm:text-5xl">Be honest: where are you weak?</h1>
                <p className="mt-2 text-ink-2">Weak subjects get ~40% more time and go first each day. Strong ones get trimmed.</p>
                <div className="mt-6 space-y-3">
                  {subjects.map((s, si) => (
                    <div key={si} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                      <span className="flex items-center gap-3 font-medium">
                        <span className="size-3 rounded-full" style={{ background: `var(--c${(si % 8) + 1})` }} />
                        {s.name}
                      </span>
                      <Segmented value={s.strength ?? "neutral"} onChange={(v) => update((d) => void (d[si].strength = v))} />
                    </div>
                  ))}
                </div>
                {create.error && (
                  <div className="mt-4">
                    <ErrorBox error={create.error} />
                  </div>
                )}
                <div className="mt-8 flex justify-between">
                  <Button variant="ghost" onClick={() => go(2)}>
                    <ArrowLeft className="size-4" /> Back
                  </Button>
                  <Button variant="accent" loading={create.isPending} onClick={() => create.mutate()}>
                    Build my plan <ArrowRight className="size-4" />
                  </Button>
                </div>
              </section>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function Nav({ onBack, onNext, nextDisabled }: { onBack: () => void; onNext: () => void; nextDisabled?: boolean }) {
  return (
    <div className="mt-8 flex justify-between">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft className="size-4" /> Back
      </Button>
      <Button onClick={onNext} disabled={nextDisabled}>
        Continue <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}

function DifficultyDots({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-0.5" role="radiogroup" aria-label="Difficulty">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          role="radio"
          aria-checked={value === n}
          aria-label={`Difficulty ${n}`}
          onClick={() => onChange(n)}
          className="grid size-5 place-items-center"
        >
          <motion.span
            className="block size-2 rounded-full"
            animate={{ backgroundColor: n <= value ? "var(--ink)" : "var(--line)", scale: n === value ? 1.25 : 1 }}
          />
        </button>
      ))}
    </div>
  );
}

const STRENGTHS: { v: Strength; label: string }[] = [
  { v: "weak", label: "Weak" },
  { v: "neutral", label: "Okay" },
  { v: "strong", label: "Strong" },
];

function Segmented({ value, onChange }: { value: Strength; onChange: (v: Strength) => void }) {
  const id = useRef(Math.random().toString(36).slice(2)).current;
  return (
    <div className="flex rounded-full bg-surface-2 p-1" role="radiogroup">
      {STRENGTHS.map(({ v, label }) => (
        <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)} className="relative rounded-full px-4 py-1.5 text-sm font-medium">
          {value === v && <motion.span layoutId={`seg-${id}`} className={`absolute inset-0 rounded-full ${v === "weak" ? "bg-accent" : "bg-surface shadow-sm"}`} />}
          <span className={`relative ${value === v ? (v === "weak" ? "text-accent-ink" : "text-ink") : "text-ink-3"}`}>{label}</span>
        </button>
      ))}
    </div>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, ExternalLink, Globe, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { CountUp, ProgressRing } from "../components/ProgressRing";
import { Button, Card, ErrorBox, Eyebrow } from "../components/ui";
import { api, type Quiz } from "../lib/api";
import { IS_ARTIFACT } from "../lib/env";

const DIFF_STYLE = {
  easy: "bg-surface-2 text-ink-2",
  medium: "bg-ink/10 text-ink",
  hard: "bg-ink text-paper",
} as const;

export default function QuizPage() {
  const topicId = Number(useParams().topicId);
  const qc = useQueryClient();
  const [round, setRound] = useState(0);
  const quiz = useQuery({
    queryKey: ["quiz-session", topicId, round],
    queryFn: () => api.createQuiz(topicId),
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [result, setResult] = useState<Quiz | null>(null);

  const submit = useMutation({
    mutationFn: (answers: (number | null)[]) => api.submitQuiz(quiz.data!.id, answers),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ["stats"] });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  });

  if (quiz.isPending) return <Generating />;
  if (quiz.error)
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorBox error={quiz.error} onRetry={() => quiz.refetch()} />
      </div>
    );

  const retake = () => {
    setResult(null);
    submit.reset();
    setRound((r) => r + 1);
  };

  return result ? <Results quiz={result} onRetake={retake} /> : <Taking quiz={quiz.data} onSubmit={(a) => submit.mutate(a)} submitting={submit.isPending} error={submit.error} />;
}

function BackLink() {
  return (
    <Link to="/today" className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
      <ArrowLeft className="size-4" /> Today
    </Link>
  );
}

function Generating() {
  const lines = [IS_ARTIFACT ? "Asking Claude about this topic…" : "Searching the web for accurate sources…", "Checking definitions…", "Writing 4 easy, 4 medium, 2 hard…", "Making the wrong answers tempting…"];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % lines.length), 2200);
    return () => clearInterval(t);
  }, [lines.length]);
  return (
    <div className="grid min-h-[60vh] place-items-center text-center">
      <div>
        <div className="relative mx-auto mb-8 size-24">
          {[0, 1, 2].map((k) => (
            <motion.span
              key={k}
              className="absolute inset-0 rounded-full border-2 border-ink"
              initial={{ scale: 0.4, opacity: 0.8 }}
              animate={{ scale: 1.4, opacity: 0 }}
              transition={{ duration: 2, repeat: Infinity, delay: k * 0.6, ease: "easeOut" }}
            />
          ))}
          <span className="absolute inset-0 grid place-items-center">
            <Globe className="size-8" />
          </span>
        </div>
        <AnimatePresence mode="wait">
          <motion.p key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="font-display text-2xl">
            {lines[i]}
          </motion.p>
        </AnimatePresence>
        <p className="mt-2 text-sm text-ink-3">This can take up to a minute.</p>
      </div>
    </div>
  );
}

function Taking({ quiz, onSubmit, submitting, error }: { quiz: Quiz; onSubmit: (a: (number | null)[]) => void; submitting: boolean; error: unknown }) {
  const [answers, setAnswers] = useState<(number | null)[]>(() => quiz.questions.map(() => null));
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState(1);
  const q = quiz.questions[idx];
  const answered = answers.filter((a) => a !== null).length;
  const last = idx === quiz.questions.length - 1;

  const move = (n: number) => {
    setDir(n > idx ? 1 : -1);
    setIdx(Math.max(0, Math.min(quiz.questions.length - 1, n)));
  };
  const choose = (o: number) => setAnswers((a) => a.map((x, i) => (i === idx ? o : x)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (["1", "2", "3", "4"].includes(e.key)) choose(Number(e.key) - 1);
      if (e.key === "ArrowRight" || e.key === "Enter") !last && move(idx + 1);
      if (e.key === "ArrowLeft") move(idx - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="mx-auto max-w-2xl">
      <BackLink />
      <div className="mt-4 mb-6">
        <Eyebrow>
          {quiz.subject} · {quiz.unit}
        </Eyebrow>
        <h1 className="font-display text-4xl">{quiz.topic}</h1>
      </div>

      <div className="mb-6 flex gap-1" aria-label={`Question ${idx + 1} of ${quiz.questions.length}`}>
        {quiz.questions.map((qq, i) => (
          <button key={qq.id} onClick={() => move(i)} aria-label={`Go to question ${i + 1}`} className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
            <motion.span className="block h-full bg-ink" initial={false} animate={{ width: answers[i] !== null ? "100%" : i === idx ? "35%" : "0%" }} />
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" custom={dir}>
        <motion.div key={q.id} initial={{ opacity: 0, x: 30 * dir }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 * dir }} transition={{ duration: 0.22 }}>
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${DIFF_STYLE[q.difficulty]}`}>{q.difficulty}</span>
              <span className="num text-xs text-ink-3">
                {idx + 1} / {quiz.questions.length}
              </span>
            </div>
            <p className="text-lg font-medium leading-snug">{q.question}</p>
            <div className="mt-5 space-y-2" role="radiogroup">
              {q.options.map((opt, o) => {
                const sel = answers[idx] === o;
                return (
                  <motion.button
                    key={o}
                    role="radio"
                    aria-checked={sel}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => choose(o)}
                    className={`relative flex w-full items-center gap-3 rounded-2xl border p-4 text-left text-sm transition ${sel ? "border-ink" : "border-line hover:border-ink-3"}`}
                  >
                    {sel && <motion.span layoutId={`sel-${q.id}`} className="absolute inset-0 rounded-2xl bg-surface-2" transition={{ type: "spring", stiffness: 500, damping: 35 }} />}
                    <span className={`num relative grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${sel ? "bg-ink text-paper" : "bg-surface-2 text-ink-2"}`}>{o + 1}</span>
                    <span className="relative">{opt}</span>
                  </motion.button>
                );
              })}
            </div>
          </Card>
        </motion.div>
      </AnimatePresence>

      {Boolean(error) && (
        <div className="mt-4">
          <ErrorBox error={error} />
        </div>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => move(idx - 1)} disabled={idx === 0}>
          <ArrowLeft className="size-4" /> Prev
        </Button>
        <span className="num text-xs text-ink-3">{answered}/10 answered</span>
        {last || answered === quiz.questions.length ? (
          <Button variant="accent" onClick={() => onSubmit(answers)} loading={submitting} disabled={answered < quiz.questions.length}>
            Submit
          </Button>
        ) : (
          <Button onClick={() => move(idx + 1)}>
            Next <ArrowRight className="size-4" />
          </Button>
        )}
      </div>
      <p className="mt-4 hidden text-center text-xs text-ink-3 sm:block">Keys: 1–4 to answer · ← → to move</p>
    </div>
  );
}

function verdict(pct: number) {
  if (pct >= 90) return "Exam-ready.";
  if (pct >= 70) return "Solid, with gaps.";
  if (pct >= 50) return "Shaky. Revise this.";
  return "Not learned yet.";
}

function Results({ quiz, onRetake }: { quiz: Quiz; onRetake: () => void }) {
  const navigate = useNavigate();
  const score = quiz.score ?? 0;
  const pct = Math.round((100 * score) / quiz.total);
  const color = pct >= 70 ? "var(--good)" : pct >= 50 ? "var(--warn)" : "var(--bad)";
  return (
    <div className="mx-auto max-w-2xl">
      <BackLink />
      <Card className="mt-4 flex flex-col items-center gap-6 py-8 text-center sm:flex-row sm:text-left">
        <ProgressRing value={score / quiz.total} size={150} stroke={12} color={color}>
          <div>
            <p className="text-3xl font-semibold">
              <CountUp value={score} />
              <span className="text-ink-3">/{quiz.total}</span>
            </p>
          </div>
        </ProgressRing>
        <div>
          <Eyebrow>{quiz.topic}</Eyebrow>
          <p className="font-display text-4xl">{verdict(pct)}</p>
          <p className="mt-1 text-sm text-ink-2">
            {pct < 70 ? "This topic goes on your weak list until you score 70%+. Re-learn it, then retake." : "Nice. Spaced revisions are already on your calendar to keep it."}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
            <Button variant="outline" onClick={onRetake}>
              <RotateCcw className="size-4" /> New questions
            </Button>
            <Button onClick={() => navigate("/today")}>Back to today</Button>
          </div>
        </div>
      </Card>

      <ol className="mt-6 space-y-3">
        {quiz.questions.map((q, i) => {
          const right = q.chosen_index === q.correct_index;
          return (
            <motion.li key={q.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }} className="card p-5">
              <div className="mb-2 flex items-center gap-2">
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1, x: right ? 0 : [0, -4, 4, -3, 3, 0] }}
                  transition={{ delay: 0.05 * i + 0.15 }}
                  className={`grid size-6 place-items-center rounded-full text-white ${right ? "bg-good" : "bg-bad"}`}
                >
                  {right ? <Check className="size-3.5" strokeWidth={3} /> : <X className="size-3.5" strokeWidth={3} />}
                </motion.span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${DIFF_STYLE[q.difficulty]}`}>{q.difficulty}</span>
              </div>
              <p className="font-medium">
                {i + 1}. {q.question}
              </p>
              <ul className="mt-3 space-y-1.5 text-sm">
                {q.options.map((o, k) => (
                  <li
                    key={k}
                    className={`rounded-xl px-3 py-2 ${k === q.correct_index ? "bg-good/15 font-medium" : k === q.chosen_index ? "bg-bad/15 line-through" : "text-ink-3"}`}
                  >
                    {o}
                    {k === q.correct_index && <span className="ml-2 text-xs font-semibold text-good">correct</span>}
                    {k === q.chosen_index && k !== q.correct_index && <span className="ml-2 text-xs font-semibold text-bad">your answer</span>}
                  </li>
                ))}
              </ul>
              <p className="mt-3 border-l-2 border-line pl-3 text-sm text-ink-2">{q.explanation}</p>
            </motion.li>
          );
        })}
      </ol>

      {quiz.sources.length > 0 && (
        <Card className="mt-6">
          <Eyebrow>Sources Claude checked</Eyebrow>
          <ul className="mt-3 space-y-2 text-sm">
            {quiz.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 underline decoration-line underline-offset-4 hover:decoration-ink">
                  {s.title} <ExternalLink className="size-3" />
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

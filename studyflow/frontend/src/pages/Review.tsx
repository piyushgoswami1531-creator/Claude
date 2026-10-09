import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Gavel } from "lucide-react";
import { useState } from "react";
import { CheckButton } from "../components/CheckButton";
import { Button, Card, ErrorBox, Eyebrow, PageTitle, Skeleton } from "../components/ui";
import { api, type Review } from "../lib/api";
import { prettyDate } from "../lib/format";

export default function ReviewPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["reviews"], queryFn: api.reviews });
  const [picked, setPicked] = useState<number | null>(null);
  const create = useMutation({
    mutationFn: api.createReview,
    onSuccess: (r) => {
      qc.setQueryData<Review[]>(["reviews"], (old) => [r, ...(old ?? [])]);
      setPicked(r.id);
    },
  });

  const reviews = list.data ?? [];
  const current = reviews.find((r) => r.id === picked) ?? reviews[0];

  return (
    <>
      <PageTitle eyebrow="Weekly review" title="No sugar-coating.">
        <Button variant="accent" onClick={() => create.mutate()} loading={create.isPending}>
          <Gavel className="size-4" /> {create.isPending ? "Judging your week…" : "Review my week"}
        </Button>
      </PageTitle>

      {create.error && (
        <div className="mb-4">
          <ErrorBox error={create.error} />
        </div>
      )}
      {list.isPending && <Skeleton className="h-80" />}
      {list.error && <ErrorBox error={list.error} onRetry={() => list.refetch()} />}

      {!list.isPending && !current && (
        <Card className="py-14 text-center">
          <p className="font-display text-3xl">No reviews yet.</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-2">
            Hit <b>Review my week</b> to get a blunt, specific verdict built from your real numbers: missed sessions, quiz scores and pace. It ends with 3 things to do this week.
          </p>
        </Card>
      )}

      <AnimatePresence mode="wait">{current && <ReviewCard key={current.id} r={current} />}</AnimatePresence>

      {reviews.length > 1 && (
        <div className="mt-8">
          <Eyebrow>History</Eyebrow>
          <div className="mt-3 flex flex-wrap gap-2">
            {reviews.map((r) => (
              <button
                key={r.id}
                onClick={() => setPicked(r.id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${r.id === current?.id ? "border-ink bg-ink text-paper" : "border-line hover:bg-surface-2"}`}
              >
                {prettyDate(r.created_at.slice(0, 10))}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function ReviewCard({ r }: { r: Review }) {
  const key = `sf-review-${r.id}`;
  const [done, setDone] = useState<boolean[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "[]");
    } catch {
      return [];
    }
  });
  const toggle = (i: number) =>
    setDone((d) => {
      const next = [...d];
      next[i] = !next[i];
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      return next;
    });

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.35 }}>
      <section className="rounded-[1.5rem] bg-ink p-6 text-paper sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] opacity-60">
          Week of {prettyDate(r.week_start)} · written {prettyDate(r.created_at.slice(0, 10))}
        </p>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="mt-3 font-display text-3xl leading-tight sm:text-5xl">
          {r.verdict}
        </motion.p>
        <ul className="mt-8 space-y-3">
          {r.findings.map((f, i) => (
            <motion.li key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + i * 0.08 }} className="flex gap-3 text-sm sm:text-base">
              <span className="num mt-0.5 text-xs opacity-50">{String(i + 1).padStart(2, "0")}</span>
              <span>{f}</span>
            </motion.li>
          ))}
        </ul>
      </section>

      <div className="mt-4">
        <Eyebrow>Your 3 actions this week</Eyebrow>
        <ol className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          {r.actions.map((a, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.08 }}
              className={`card flex flex-col gap-4 p-5 transition ${done[i] ? "opacity-60" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span className="num font-display text-4xl">{i + 1}</span>
                <CheckButton checked={!!done[i]} onToggle={() => toggle(i)} label={`Mark action ${i + 1} done`} />
              </div>
              <p className={`text-sm font-medium ${done[i] ? "line-through" : ""}`}>{a}</p>
            </motion.li>
          ))}
        </ol>
      </div>
    </motion.div>
  );
}

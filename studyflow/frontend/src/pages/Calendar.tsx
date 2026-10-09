import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, GraduationCap } from "lucide-react";
import { useMemo, useState } from "react";
import { Card, Dot, ErrorBox, Eyebrow, PageTitle, Skeleton } from "../components/ui";
import { api, type Item } from "../lib/api";
import { addDays, isoDate, kindLabel, minutes, parseDate, prettyDate, subjectColor } from "../lib/format";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CalendarPage() {
  const [month, setMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selected, setSelected] = useState<string>(isoDate(new Date()));

  // Grid always starts on a Monday and shows 6 weeks.
  const gridStart = addDays(month, -((month.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const from = isoDate(days[0]);
  const to = isoDate(days[41]);

  const q = useQuery({ queryKey: ["schedule", from, to], queryFn: () => api.schedule(from, to) });
  const plan = useQuery({ queryKey: ["plan"], queryFn: api.plan });

  const byDate = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const it of q.data?.items ?? []) m.set(it.date, [...(m.get(it.date) ?? []), it]);
    return m;
  }, [q.data]);

  const today = q.data?.today ?? isoDate(new Date());
  const exam = q.data?.exam_date ?? plan.data?.exam_date;
  const selectedItems = byDate.get(selected) ?? [];

  return (
    <>
      <PageTitle eyebrow="Calendar" title={month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}>
        <div className="flex gap-2">
          <button aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="grid size-10 place-items-center rounded-full border border-line bg-surface hover:bg-surface-2">
            <ChevronLeft className="size-4" />
          </button>
          <button
            onClick={() => {
              const n = new Date();
              setMonth(new Date(n.getFullYear(), n.getMonth(), 1));
              setSelected(isoDate(n));
            }}
            className="rounded-full border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2"
          >
            Today
          </button>
          <button aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="grid size-10 place-items-center rounded-full border border-line bg-surface hover:bg-surface-2">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </PageTitle>

      {q.error && <ErrorBox error={q.error} onRetry={() => q.refetch()} />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
        <Card className="p-2 sm:p-4">
          <div className="grid grid-cols-7 gap-1 pb-2 text-center text-[11px] font-semibold uppercase tracking-wider text-ink-3">
            {WEEKDAYS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          {q.isPending ? (
            <Skeleton className="h-96" />
          ) : (
            <motion.div key={from} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-7 gap-1">
              {days.map((d) => {
                const iso = isoDate(d);
                const items = byDate.get(iso) ?? [];
                const inMonth = d.getMonth() === month.getMonth();
                const isToday = iso === today;
                const isExam = iso === exam;
                const isSel = iso === selected;
                const work = items.filter((i) => i.kind !== "buffer");
                const done = work.length > 0 && work.every((i) => i.status === "done");
                const missed = items.some((i) => i.status === "missed");
                const kinds = new Set(items.map((i) => i.kind));
                const colors = [...new Set(work.map((i) => i.color))].slice(0, 4);
                return (
                  <button
                    key={iso}
                    onClick={() => setSelected(iso)}
                    className={`relative flex aspect-square min-h-12 flex-col rounded-xl p-1.5 text-left transition sm:aspect-[1/0.9] sm:p-2 ${
                      isSel ? "bg-ink text-paper" : isExam ? "bg-accent text-accent-ink" : "hover:bg-surface-2"
                    } ${inMonth ? "" : "opacity-35"}`}
                  >
                    <span className={`num text-xs sm:text-sm ${isToday && !isSel ? "rounded-full bg-accent px-1.5 text-accent-ink" : ""} self-start`}>{d.getDate()}</span>
                    {isExam && <GraduationCap className="mt-auto size-4" />}
                    {!isExam && (
                      <span className="mt-auto flex flex-wrap items-center gap-0.5">
                        {colors.map((c) => (
                          <Dot key={c} color={subjectColor(c)} className="size-1.5 sm:size-2" />
                        ))}
                        {kinds.has("buffer") && <span className={`text-[9px] font-semibold ${isSel ? "" : "text-ink-3"}`}>BUF</span>}
                        {kinds.has("final_revision") && <span className={`text-[9px] font-semibold ${isSel ? "" : "text-ink-3"}`}>REV</span>}
                      </span>
                    )}
                    {done && <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-good" aria-label="all done" />}
                    {missed && !done && <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-bad" aria-label="missed sessions" />}
                  </button>
                );
              })}
            </motion.div>
          )}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-ink-3">
            {plan.data?.subjects.map((s) => (
              <span key={s.id} className="flex items-center gap-1.5">
                <Dot color={subjectColor(s.color)} /> {s.name}
              </span>
            ))}
            <span className="flex items-center gap-1.5"><Dot color="var(--good)" className="size-1.5" /> done</span>
            <span className="flex items-center gap-1.5"><Dot color="var(--bad)" className="size-1.5" /> missed</span>
          </div>
        </Card>

        <Card className="lg:sticky lg:top-6 lg:self-start">
          <Eyebrow>{selected === today ? "Today" : prettyDate(selected, { weekday: "long" })}</Eyebrow>
          <p className="font-display text-3xl">{parseDate(selected).toLocaleDateString(undefined, { day: "numeric", month: "long" })}</p>
          <AnimatePresence mode="wait">
            <motion.ul key={selected} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 space-y-3">
              {selected === exam && <li className="rounded-xl bg-accent p-3 text-sm font-semibold text-accent-ink">Exam day. Good luck.</li>}
              {selectedItems.length === 0 && selected !== exam && <li className="text-sm text-ink-3">Nothing planned.</li>}
              {selectedItems.map((i) => (
                <li key={i.id} className="flex items-start gap-3">
                  <Dot color={i.kind === "buffer" ? "var(--ink-3)" : subjectColor(i.color)} className="mt-1.5 size-2.5" />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${i.status === "done" ? "line-through opacity-60" : ""}`}>{i.topic ?? (i.kind === "buffer" ? "Buffer / catch-up" : "Revision")}</p>
                    <p className="text-xs text-ink-3">
                      {kindLabel(i.kind, i.rev_interval)} · <span className="num">{minutes(i.minutes)}</span>
                      {i.status === "missed" && <span className="font-semibold text-bad"> · missed</span>}
                      {i.status === "done" && <span className="font-semibold text-good"> · done</span>}
                    </p>
                  </div>
                </li>
              ))}
            </motion.ul>
          </AnimatePresence>
        </Card>
      </div>
    </>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, BrainCircuit, CalendarClock, CheckCheck, RefreshCw } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router";
import { CheckButton } from "../components/CheckButton";
import { ProgressRing } from "../components/ProgressRing";
import { Button, Card, ErrorBox, Eyebrow, PageTitle, Skeleton, useToast } from "../components/ui";
import { api, type Item, type TodayView } from "../lib/api";
import { kindLabel, minutes, prettyDate, subjectColor } from "../lib/format";

export default function Today() {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["today"], queryFn: api.today });
  const announced = useRef<number | null>(null);

  useEffect(() => {
    const r = q.data?.replanned;
    if (r && r.missed > 0 && announced.current !== r.version) {
      announced.current = r.version;
      toast({ text: `You missed ${r.missed} session${r.missed > 1 ? "s" : ""}. Your plan was rebuilt around them.` });
      qc.invalidateQueries({ queryKey: ["schedule"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    }
  }, [q.data?.replanned, toast, qc]);

  const toggle = useMutation({
    mutationFn: (item: Item) => api.setItem(item.id, item.status === "done" ? "pending" : "done"),
    onMutate: async (item) => {
      await qc.cancelQueries({ queryKey: ["today"] });
      const prev = qc.getQueryData<TodayView>(["today"]);
      qc.setQueryData<TodayView>(["today"], (old) =>
        old && { ...old, items: old.items.map((i) => (i.id === item.id ? { ...i, status: i.status === "done" ? "pending" : "done" } : i)) },
      );
      return { prev };
    },
    onError: (err, _item, ctx) => {
      if (ctx?.prev) qc.setQueryData(["today"], ctx.prev);
      toast({ text: err instanceof Error ? err.message : "Couldn't update that session." });
    },
    onSuccess: (res) => {
      if (res.topic_completed && res.topic_id) {
        toast({
          text: `Topic finished: ${res.item.topic}. Prove it.`,
          action: { label: "Take quiz", onClick: () => navigate(`/quiz/${res.topic_id}`) },
        });
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["today"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["plan"] });
      qc.invalidateQueries({ queryKey: ["schedule"] });
    },
  });

  const finishTopic = useMutation({
    mutationFn: (topicId: number) => api.completeTopic(topicId),
    onSuccess: (_r, topicId) => {
      qc.invalidateQueries();
      navigate(`/quiz/${topicId}`);
    },
    onError: (err) => toast({ text: err instanceof Error ? err.message : "Couldn't finish topic." }),
  });

  const replan = useMutation({
    mutationFn: api.replan,
    onSuccess: () => {
      qc.invalidateQueries();
      toast({ text: "Plan rebuilt from today." });
    },
  });

  if (q.isPending) return <TodaySkeleton />;
  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;

  const d = q.data;
  const work = d.items.filter((i) => i.kind !== "buffer");
  const planned = work.reduce((n, i) => n + i.minutes, 0);
  const done = work.filter((i) => i.status === "done").reduce((n, i) => n + i.minutes, 0);
  const allDone = work.length > 0 && work.every((i) => i.status === "done");
  const isBufferDay = d.items.length > 0 && d.items.every((i) => i.kind === "buffer");

  return (
    <>
      <PageTitle eyebrow={prettyDate(d.date, { weekday: "long", day: "numeric", month: "long" })} title={greeting(d.days_left)}>
        <Button variant="outline" onClick={() => replan.mutate()} loading={replan.isPending} title="Rebuild the plan from today">
          <RefreshCw className="size-4" /> Re-plan
        </Button>
      </PageTitle>

      {d.required_daily_minutes && (
        <Card className="mb-4 flex items-start gap-3 border-warn/50 bg-warn/10">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warn" />
          <p className="text-sm">
            <b>Overloaded.</b> You set <span className="num">{minutes(d.daily_minutes)}</span>/day but this syllabus needs about{" "}
            <span className="num font-semibold">{minutes(d.required_daily_minutes)}</span>/day. Sessions have been shortened to fit. Study more, or start a new plan with more time.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">
        <Card className="flex flex-col items-center justify-center gap-4 py-8 text-center">
          <ProgressRing value={planned ? done / planned : 0} size={170} stroke={14} color={allDone ? "var(--good)" : "var(--ink)"} label={`${done} of ${planned} minutes done`}>
            <div>
              <p className="num text-3xl font-semibold">{planned ? Math.round((100 * done) / planned) : 0}%</p>
              <p className="text-xs text-ink-3">
                <span className="num">{minutes(done)}</span> / <span className="num">{minutes(planned)}</span>
              </p>
            </div>
          </ProgressRing>
          <div>
            <p className="num text-4xl font-semibold">{d.days_left}</p>
            <p className="text-sm text-ink-3">days to exam · {prettyDate(d.exam_date)}</p>
          </div>
        </Card>

        <div className="space-y-3">
          <AnimatePresence>
            {allDone && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-3 rounded-[1.25rem] bg-accent p-5 text-accent-ink"
              >
                <CheckCheck className="size-6" />
                <div>
                  <p className="font-semibold">Done for today.</p>
                  <p className="text-sm opacity-80">That's how plans actually get finished. Quiz anything you just completed.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {d.items.length === 0 && (
            <Card>
              <p className="font-display text-2xl">Nothing scheduled today.</p>
              <p className="mt-1 text-sm text-ink-3">Your exam may be today or already past. Start a new plan from the Progress page.</p>
            </Card>
          )}

          {isBufferDay && (
            <Card className="text-sm text-ink-2">
              <p className="font-display text-2xl text-ink">Buffer day.</p>
              Catch up on anything you're behind on, or retake a weak quiz. If you're on track, rest. You earned it.
            </Card>
          )}

          <ul className="space-y-3">
            {d.items.map((item, i) => (
              <ItemRow
                key={item.id}
                item={item}
                index={i}
                onToggle={() => toggle.mutate(item)}
                onFinishTopic={() => item.topic_id && finishTopic.mutate(item.topic_id)}
                finishing={finishTopic.isPending && finishTopic.variables === item.topic_id}
              />
            ))}
          </ul>

          {d.tomorrow.length > 0 && (
            <Card className="mt-6" delay={0.15}>
              <Eyebrow>Tomorrow</Eyebrow>
              <ul className="mt-3 space-y-2">
                {d.tomorrow.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 text-sm">
                    <span className="size-2 rounded-full" style={{ background: subjectColor(t.color) }} />
                    <span className="flex-1 truncate">{t.topic ?? kindLabel(t.kind, null)}</span>
                    <span className="text-xs text-ink-3">{kindLabel(t.kind, t.rev_interval)}</span>
                    <span className="num w-14 text-right text-xs text-ink-3">{minutes(t.minutes)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function ItemRow({ item, index, onToggle, onFinishTopic, finishing }: {
  item: Item; index: number; onToggle: () => void; onFinishTopic: () => void; finishing: boolean;
}) {
  const color = subjectColor(item.color);
  const done = item.status === "done";
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="card relative flex items-center gap-4 overflow-hidden p-4"
    >
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: color }} />
      <CheckButton checked={done} onToggle={onToggle} color={item.kind === "buffer" ? "var(--ink-3)" : color} label={`Mark ${item.topic ?? "session"} ${done ? "not done" : "done"}`} />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <KindChip item={item} />
          <span className="num text-xs text-ink-3">{minutes(item.minutes)}</span>
        </div>
        <motion.p animate={{ opacity: done ? 0.5 : 1 }} className={`truncate font-semibold ${done ? "line-through decoration-2" : ""}`}>
          {item.topic ?? (item.kind === "buffer" ? "Catch-up time" : "Revise weak topics")}
        </motion.p>
        {item.subject && (
          <p className="truncate text-xs text-ink-3">
            {item.subject} · {item.unit}
          </p>
        )}
      </div>
      {item.topic_id && item.kind === "learn" && item.topic_status !== "done" && !done && (
        <Button variant="ghost" className="shrink-0 px-3 text-xs" onClick={onFinishTopic} loading={finishing} title="I've finished this whole topic: quiz me now">
          Finish topic
        </Button>
      )}
      {item.topic_id && item.topic_status === "done" && (
        <Link to={`/quiz/${item.topic_id}`} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold hover:bg-surface-2">
          <BrainCircuit className="size-3.5" /> Quiz
        </Link>
      )}
    </motion.li>
  );
}

function KindChip({ item }: { item: Item }) {
  const icon = item.kind === "revise" ? <RefreshCw className="size-3" /> : item.kind === "buffer" ? <CalendarClock className="size-3" /> : null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.kind === "learn" ? "bg-ink text-paper" : "bg-surface-2 text-ink-2"}`}>
      {icon}
      {kindLabel(item.kind, item.rev_interval)}
    </span>
  );
}

function greeting(daysLeft: number) {
  if (daysLeft <= 0) return "Exam day.";
  if (daysLeft === 1) return "Last day. Revise, don't cram.";
  if (daysLeft <= 7) return "Final stretch.";
  return "Today's plan.";
}

function TodaySkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-14 w-72" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">
        <Skeleton className="h-80" />
        <div className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      </div>
    </div>
  );
}

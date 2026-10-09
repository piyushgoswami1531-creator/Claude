import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Flame, Plus, Target, Timer } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CountUp, ProgressRing } from "../components/ProgressRing";
import { Button, Card, Dot, ErrorBox, Eyebrow, PageTitle, Skeleton } from "../components/ui";
import { api, type Stats, type TopicStat } from "../lib/api";
import { minutes, prettyDate, subjectColor } from "../lib/format";

const axis = { stroke: "var(--ink-3)", fontSize: 11, tickLine: false, axisLine: false } as const;

function ChartTooltip({ active, payload, label, unit = "" }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; unit?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-ink">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-ink-2">
          <Dot color={p.color} className="size-2" /> {p.name}: <span className="num font-semibold text-ink">{unit === "min" ? minutes(p.value) : `${p.value}${unit}`}</span>
        </p>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const q = useQuery({ queryKey: ["stats"], queryFn: api.stats });
  const navigate = useNavigate();

  if (q.isPending)
    return (
      <div className="space-y-4">
        <Skeleton className="h-14 w-72" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const s = q.data;
  const o = s.overall;
  const quizzed = s.subjects.filter((x) => x.accuracy !== null);
  const notQuizzed = s.subjects.filter((x) => x.accuracy === null);
  const maxMinutes = Math.max(60, ...s.planned_vs_actual.flatMap((d) => [d.planned, d.actual]));
  const step = maxMinutes <= 180 ? 30 : maxMinutes <= 480 ? 60 : 120;
  const yTicks = Array.from({ length: Math.ceil(maxMinutes / step) + 1 }, (_, i) => i * step);

  return (
    <>
      <PageTitle eyebrow="Progress" title="The numbers don't lie.">
        <Button variant="outline" onClick={() => navigate("/setup")}>
          <Plus className="size-4" /> New plan
        </Button>
      </PageTitle>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Card className="flex flex-col items-center gap-3 text-center">
          <ProgressRing value={o.completion_pct / 100} size={104} stroke={10} color="var(--ink)">
            <span className="text-xl font-semibold"><CountUp value={o.completion_pct} suffix="%" /></span>
          </ProgressRing>
          <div>
            <p className="text-sm font-semibold">Syllabus done</p>
            <p className="num text-xs text-ink-3">{o.topics_done}/{o.topics} topics</p>
          </div>
        </Card>
        <Kpi delay={0.05} icon={<Flame className="size-5" />} label="Streak" value={o.streak} suffix={o.streak === 1 ? " day" : " days"} sub={`Best: ${o.best_streak}`} hot={o.streak >= 3} />
        <Kpi delay={0.1} icon={<Target className="size-5" />} label="Quiz accuracy" value={o.accuracy ?? 0} suffix="%" empty={o.accuracy === null} sub={`${o.quizzes_taken} quiz${o.quizzes_taken === 1 ? "" : "zes"} taken`} />
        <Kpi delay={0.15} icon={<Timer className="size-5" />} label="Days to exam" value={o.days_left} sub={prettyDate(o.exam_date)} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3" delay={0.1}>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <Eyebrow>Last 14 days</Eyebrow>
              <h2 className="text-lg font-semibold">Planned vs actual study time</h2>
            </div>
            <p className="num text-xs text-ink-3">{minutes(o.minutes_done_total)} studied · {o.sessions_missed_total} sessions missed</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={s.planned_vs_actual.map((d) => ({ ...d, label: prettyDate(d.date, { day: "numeric", month: "short" }) }))} barGap={2} barCategoryGap="22%">
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={12} />
                <YAxis {...axis} width={40} ticks={yTicks} domain={[0, yTicks[yTicks.length - 1]]} tickFormatter={(v: number) => (v < 60 ? `${v}m` : `${+(v / 60).toFixed(1)}h`)} />
                <Tooltip content={<ChartTooltip unit="min" />} cursor={{ fill: "var(--surface-2)" }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--ink-2)" }} />
                <Bar dataKey="planned" name="Planned" fill="var(--ink-3)" fillOpacity={0.35} radius={[4, 4, 0, 0]} />
                <Bar dataKey="actual" name="Actual" fill="var(--c1)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="lg:col-span-2" delay={0.15}>
          <Eyebrow>By subject</Eyebrow>
          <h2 className="mb-4 text-lg font-semibold">Quiz accuracy</h2>
          {quizzed.length > 0 ? (
            <div style={{ height: Math.max(140, quizzed.length * 52 + 30) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={quizzed.map((x) => ({ name: x.name, accuracy: x.accuracy ?? 0 }))} margin={{ top: 18, right: 40 }}>
                  <XAxis type="number" domain={[0, 100]} hide />
                  <YAxis type="category" dataKey="name" {...axis} width={110} tick={{ fill: "var(--ink-2)", fontSize: 12 }} />
                  <ReferenceLine x={70} stroke="var(--ink-3)" strokeDasharray="3 3" label={{ value: "70%", position: "top", fill: "var(--ink-3)", fontSize: 10 }} />
                  <Tooltip content={<ChartTooltip unit="%" />} cursor={{ fill: "var(--surface-2)" }} />
                  <Bar dataKey="accuracy" name="Accuracy" radius={[0, 4, 4, 0]} barSize={18}>
                    {quizzed.map((x) => (
                      <Cell key={x.id} fill={subjectColor(x.color)} />
                    ))}
                    <LabelList dataKey="accuracy" position="right" formatter={(v: unknown) => `${v}%`} style={{ fill: "var(--ink)", fontSize: 12, fontFamily: "var(--font-mono)" }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-ink-3">No quizzes yet. Finish a topic and take its quiz. Untested knowledge is a guess.</p>
          )}
          {quizzed.length > 0 && notQuizzed.length > 0 && (
            <p className="mt-2 text-xs text-ink-3">No quizzes yet: {notQuizzed.map((x) => x.name).join(", ")}</p>
          )}
          <DifficultyStrip s={s} />
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card delay={0.2}>
          <Eyebrow>Subjects</Eyebrow>
          <h2 className="mb-4 text-lg font-semibold">Completion & attendance</h2>
          <ul className="space-y-4">
            {s.subjects.map((x) => (
              <li key={x.id}>
                <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    <Dot color={subjectColor(x.color)} /> {x.name}
                    {x.strength === "weak" && <span className="rounded-full bg-accent px-1.5 text-[10px] font-semibold text-accent-ink">WEAK</span>}
                  </span>
                  <span className="num text-xs text-ink-3">
                    {x.completion_pct}% · {x.sessions.done}/{x.sessions.planned} sessions
                    {x.sessions.missed > 0 && <span className="text-bad"> · {x.sessions.missed} missed</span>}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <motion.div className="h-full rounded-full" style={{ background: subjectColor(x.color) }} initial={{ width: 0 }} animate={{ width: `${x.completion_pct}%` }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card delay={0.25}>
          <Eyebrow>Fix these first</Eyebrow>
          <h2 className="mb-4 text-lg font-semibold">Weak topics</h2>
          {s.weak_topics.length === 0 ? (
            <p className="text-sm text-ink-3">Nothing flagged yet. A topic lands here if you score under 60% on its quiz or miss 2+ sessions.</p>
          ) : (
            <ul className="divide-y divide-line">
              {s.weak_topics.slice(0, 8).map((t) => (
                <WeakRow key={t.id} t={t} />
              ))}
            </ul>
          )}
        </Card>
      </div>

      <AllTopics topics={s.topics} />
    </>
  );
}

function Kpi({ icon, label, value, suffix = "", sub, delay, hot, empty }: { icon: React.ReactNode; label: string; value: number; suffix?: string; sub: string; delay: number; hot?: boolean; empty?: boolean }) {
  return (
    <Card delay={delay} className={`flex flex-col justify-between gap-6 ${hot ? "bg-accent text-accent-ink" : ""}`}>
      <span className={`grid size-10 place-items-center rounded-full ${hot ? "bg-accent-ink/10" : "bg-surface-2"}`}>{icon}</span>
      <div>
        <p className="text-3xl font-semibold">{empty ? <span className="num">–</span> : <CountUp value={value} suffix={suffix} />}</p>
        <p className="text-sm font-semibold">{label}</p>
        <p className={`text-xs ${hot ? "opacity-70" : "text-ink-3"}`}>{sub}</p>
      </div>
    </Card>
  );
}

function DifficultyStrip({ s }: { s: Stats }) {
  const d = s.accuracy_by_difficulty;
  if (d.easy === null && d.medium === null && d.hard === null) return null;
  return (
    <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4 text-center">
      {(["easy", "medium", "hard"] as const).map((k) => (
        <div key={k}>
          <p className="num text-lg font-semibold">{d[k] === null ? "–" : `${d[k]}%`}</p>
          <p className="text-xs capitalize text-ink-3">{k}</p>
        </div>
      ))}
    </div>
  );
}

function WeakRow({ t }: { t: TopicStat }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <Dot color={subjectColor(t.color)} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{t.name}</p>
        <p className="truncate text-xs text-ink-3">
          {t.subject}
          {t.missed > 0 && ` · ${t.missed} missed`}
        </p>
      </div>
      {t.accuracy !== null && <span className={`num text-sm font-semibold ${t.accuracy < 60 ? "text-bad" : "text-ink"}`}>{t.accuracy}%</span>}
      {t.status === "done" && (
        <Link to={`/quiz/${t.id}`} className="rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-surface-2">
          Retake
        </Link>
      )}
    </li>
  );
}

function AllTopics({ topics }: { topics: TopicStat[] }) {
  const [open, setOpen] = useState(false);
  const shown = open ? topics : topics.slice(0, 6);
  return (
    <Card className="mt-4" delay={0.3}>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <Eyebrow>Every topic</Eyebrow>
          <h2 className="text-lg font-semibold">Topic tracker</h2>
        </div>
        {topics.length > 6 && (
          <Button variant="ghost" onClick={() => setOpen((v) => !v)}>
            {open ? "Show less" : `Show all ${topics.length}`}
          </Button>
        )}
      </div>
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-3">
              <th className="py-2 font-medium">Topic</th>
              <th className="py-2 font-medium">Subject</th>
              <th className="py-2 font-medium">Status</th>
              <th className="py-2 text-right font-medium">Last quiz</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((t) => (
              <tr key={t.id}>
                <td className="py-2.5 pr-3 font-medium">{t.name}</td>
                <td className="py-2.5 pr-3 text-ink-2">
                  <span className="flex items-center gap-2"><Dot color={subjectColor(t.color)} className="size-2" />{t.subject}</span>
                </td>
                <td className="py-2.5 pr-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${t.status === "done" ? "bg-good/15 text-good" : "bg-surface-2 text-ink-3"}`}>{t.status === "done" ? "Done" : "To do"}</span>
                </td>
                <td className="num py-2.5 text-right">{t.accuracy === null ? <span className="text-ink-3">–</span> : `${t.accuracy}%`}</td>
                <td className="py-2.5 pl-3 text-right">
                  {t.status === "done" && (
                    <Link to={`/quiz/${t.id}`} className="text-xs font-semibold underline decoration-line underline-offset-4 hover:decoration-ink">
                      {t.attempts ? "Retake" : "Quiz"}
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

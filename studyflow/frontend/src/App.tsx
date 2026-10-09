import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { Layout } from "./components/Layout";
import { ErrorBox, Skeleton } from "./components/ui";
import { api, ApiError } from "./lib/api";
import CalendarPage from "./pages/Calendar";
import QuizPage from "./pages/Quiz";
import ReviewPage from "./pages/Review";
import Setup from "./pages/Setup";
import Today from "./pages/Today";
import AuthPage from "./pages/Auth";

// Recharts is heavy: only load it when the Progress page is opened.
const Dashboard = lazy(() => import("./pages/Dashboard"));

function Page({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <motion.span className="grid size-14 place-items-center rounded-2xl bg-ink" animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 1.2, repeat: Infinity }}>
        <svg viewBox="0 0 32 32" className="size-8"><path d="M7 17.5l5.5 5.5L25 10" fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </motion.span>
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const me = useQuery({ queryKey: ["me"], queryFn: api.me, retry: false });
  const loggedIn = !!me.data;
  const plan = useQuery({ queryKey: ["plan"], queryFn: api.plan, enabled: loggedIn });

  if (me.isPending) return <Splash />;
  if (!loggedIn) {
    if (me.error && !(me.error instanceof ApiError && me.error.status === 401)) {
      return (
        <div className="mx-auto max-w-xl p-6">
          <ErrorBox error={me.error} onRetry={() => me.refetch()} />
        </div>
      );
    }
    return <AuthPage />;
  }
  const noPlan = plan.error instanceof ApiError && plan.error.status === 404;

  if (location.pathname.startsWith("/setup") || noPlan) {
    return location.pathname.startsWith("/setup") ? <Setup /> : <Navigate to="/setup" replace />;
  }
  if (plan.isPending) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (plan.error) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <ErrorBox error={plan.error} onRetry={() => plan.refetch()} />
      </div>
    );
  }

  return (
    <Layout>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<Navigate to="/today" replace />} />
          <Route path="/today" element={<Page><Today /></Page>} />
          <Route path="/calendar" element={<Page><CalendarPage /></Page>} />
          <Route path="/dashboard" element={<Page><Suspense fallback={<Skeleton className="h-96" />}><Dashboard /></Suspense></Page>} />
          <Route path="/review" element={<Page><ReviewPage /></Page>} />
          <Route path="/quiz/:topicId" element={<Page><QuizPage /></Page>} />
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Routes>
      </AnimatePresence>
    </Layout>
  );
}

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

export default function App() {
  const location = useLocation();
  const plan = useQuery({ queryKey: ["plan"], queryFn: api.plan });
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

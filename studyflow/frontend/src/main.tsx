import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, MemoryRouter } from "react-router";
import App from "./App";
import { ToastProvider } from "./components/ui";
import { ApiError } from "./lib/api";
import { IS_ARTIFACT } from "./lib/env";
import { setSession } from "./lib/session";
import "./index.css";

const onAuthError = (err: unknown) => {
  if (err instanceof ApiError && err.status === 401 && queryClient.getQueryData(["me"])) {
    setSession(queryClient, null);
  }
};

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onAuthError }),
  mutationCache: new MutationCache({ onError: onAuthError }),
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

// Inside a claude.ai Artifact the page can't own the URL, so routes live in memory.
function Router({ children }: { children: React.ReactNode }) {
  return IS_ARTIFACT ? <MemoryRouter initialEntries={["/today"]}>{children}</MemoryRouter> : <BrowserRouter>{children}</BrowserRouter>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Router>
        <ToastProvider>
          <App />
        </ToastProvider>
      </Router>
    </QueryClientProvider>
  </StrictMode>,
);

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Download, LogOut, Share, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, type Me } from "../lib/api";
import { IS_ARTIFACT } from "../lib/env";
import { useInstall } from "../lib/install";
import { setSession } from "../lib/session";
import { Button } from "./ui";

export function AccountMenu({ placement = "up" }: { placement?: "up" | "down" }) {
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: api.me, staleTime: 60_000 });
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const install = useInstall();
  const [iosHelp, setIosHelp] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const logout = useMutation({
    mutationFn: api.logout,
    onSettled: () => setSession(qc, null),
  });

  if (!me) return null;
  const initial = me.name.trim()[0]?.toUpperCase() ?? "?";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full border border-line bg-surface py-1 pr-3 pl-1 text-sm transition hover:bg-surface-2"
      >
        <span className="grid size-8 place-items-center rounded-full bg-accent font-semibold text-accent-ink">{initial}</span>
        <span className="max-w-24 truncate font-medium">{me.name.split(" ")[0]}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: placement === "up" ? 8 : -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className={`absolute z-50 w-72 rounded-2xl border border-line bg-surface p-2 shadow-2xl ${
              placement === "up" ? "bottom-full left-0 mb-2" : "top-full right-0 mt-2"
            }`}
          >
            <div className="px-3 py-2">
              <p className="truncate font-semibold">{me.name}</p>
              <p className="truncate text-xs text-ink-3">
                {IS_ARTIFACT ? (me.storage === "cloud" ? "Saved privately to your Claude account" : "Saved on this device only") : me.email}
              </p>
            </div>
            <AiUsage me={me} />
            <div className="my-1 border-t border-line" />
            {!IS_ARTIFACT && install.canPrompt && (
              <MenuItem icon={<Download className="size-4" />} onClick={() => install.prompt().then(() => setOpen(false))}>
                Install app
              </MenuItem>
            )}
            {!IS_ARTIFACT && install.iosManual && (
              <MenuItem icon={<Share className="size-4" />} onClick={() => setIosHelp((v) => !v)}>
                Add to Home Screen
              </MenuItem>
            )}
            {iosHelp && (
              <p className="mx-3 mb-2 rounded-xl bg-surface-2 p-3 text-xs text-ink-2">
                In Safari, tap the <b>Share</b> button, then <b>Add to Home Screen</b>.
              </p>
            )}
            {!IS_ARTIFACT && (
              <MenuItem icon={<LogOut className="size-4" />} onClick={() => logout.mutate()}>
                Log out
              </MenuItem>
            )}
            <MenuItem icon={<Trash2 className="size-4" />} danger onClick={() => { setOpen(false); setConfirmDelete(true); }}>
              {IS_ARTIFACT ? "Erase my data" : "Delete account"}
            </MenuItem>
          </motion.div>
        )}
      </AnimatePresence>

      {createPortal(<AnimatePresence>{confirmDelete && <DeleteDialog onClose={() => setConfirmDelete(false)} />}</AnimatePresence>, document.body)}
    </div>
  );
}

function AiUsage({ me }: { me: Me }) {
  if (me.ai.mode === "demo") {
    return <p className="mx-3 mb-2 rounded-xl bg-warn/10 px-3 py-2 text-xs text-ink-2">Demo AI: offline quizzes and reviews.</p>;
  }
  if (!me.ai.limit) return null;
  const left = Math.max(0, me.ai.limit - me.ai.used_today);
  return (
    <div className="mx-3 mb-2">
      <div className="mb-1 flex justify-between text-xs text-ink-3">
        <span>AI requests today</span>
        <span className="num">{left} left</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <motion.div className="h-full rounded-full bg-ink" initial={{ width: 0 }} animate={{ width: `${(100 * me.ai.used_today) / me.ai.limit}%` }} />
      </div>
    </div>
  );
}

function MenuItem({ icon, children, onClick, danger }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-surface-2 ${danger ? "text-bad" : "text-ink"}`}
    >
      {icon}
      {children}
    </button>
  );
}

function DeleteDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [password, setPassword] = useState("");
  const del = useMutation({
    mutationFn: () => api.deleteAccount(password),
    onSuccess: () => {
      if (IS_ARTIFACT) {
        // No account to sign out of: drop the cached plan and start over at setup.
        // resetQueries (unlike removeQueries) keeps mounted screens subscribed, so they reload into setup.
        void qc.resetQueries({ predicate: (q) => q.queryKey[0] !== "me" });
        onClose();
      } else setSession(qc, null);
    },
  });
  return (
    <motion.div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="del-title"
        initial={{ scale: 0.95, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="card w-full max-w-sm p-6"
      >
        <div className="flex items-start justify-between">
          <h2 id="del-title" className="font-display text-3xl">{IS_ARTIFACT ? "Erase your data?" : "Delete account?"}</h2>
          <button aria-label="Close" onClick={onClose} className="rounded-full p-1 text-ink-3 hover:text-ink">
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-2 text-sm text-ink-2">This permanently deletes your {IS_ARTIFACT ? "plan" : "plans"}, quiz scores and reviews. It can't be undone.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            del.mutate();
          }}
          className="mt-4 space-y-3"
        >
          {!IS_ARTIFACT && <input
            type="password"
            autoComplete="current-password"
            placeholder="Your password"
            aria-label="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-line bg-surface px-4 py-3 outline-none focus:border-ink"
            autoFocus
          />}
          {del.error && <p className="text-sm text-bad">{del.error.message}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={del.isPending} disabled={!IS_ARTIFACT && !password} className="!bg-bad !text-white">
              {IS_ARTIFACT ? "Erase everything" : "Delete forever"}
            </Button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

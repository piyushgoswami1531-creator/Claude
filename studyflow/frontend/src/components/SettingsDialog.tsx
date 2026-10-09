import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Eye, EyeOff, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { getSettings, MODELS, saveSettings } from "../local/settings";
import { Button, useToast } from "./ui";

/** Standalone (Netlify) build: name, the user's own Claude API key, and model. */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const initial = getSettings();
  const [name, setName] = useState(initial.name);
  const [apiKey, setApiKey] = useState(initial.apiKey);
  const [model, setModel] = useState(initial.model);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");

  const save = (e: FormEvent) => {
    e.preventDefault();
    const key = apiKey.trim();
    if (key && !key.startsWith("sk-ant-")) {
      setError("That doesn't look like a Claude API key. Keys start with sk-ant-.");
      return;
    }
    try {
      saveSettings({ name, apiKey: key, model });
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    void qc.invalidateQueries({ queryKey: ["me"] });
    void qc.invalidateQueries({ queryKey: ["health"] });
    toast({ text: key ? "Saved. Real AI is on." : "Saved. Using demo AI." });
    onClose();
  };

  return (
    <motion.div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        initial={{ scale: 0.95, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="card max-h-[90dvh] w-full max-w-md overflow-y-auto p-6"
      >
        <div className="flex items-start justify-between">
          <h2 id="settings-title" className="font-display text-3xl">Settings</h2>
          <button aria-label="Close" onClick={onClose} className="rounded-full p-1 text-ink-3 hover:text-ink">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={save} className="mt-4 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-2">Your name</span>
            <input id="settings-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Student"
              className="w-full rounded-xl border border-line bg-surface px-4 py-3 outline-none focus:border-ink" />
          </label>

          <div>
            <label htmlFor="settings-key" className="mb-1 block text-sm font-medium text-ink-2">Claude API key (optional)</label>
            <div className="flex gap-2">
              <input
                id="settings-key"
                type={show ? "text" : "password"}
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setError(""); }}
                placeholder="sk-ant-..."
                autoComplete="off"
                spellCheck={false}
                className="num min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-ink"
              />
              <button type="button" aria-label={show ? "Hide key" : "Show key"} onClick={() => setShow((v) => !v)}
                className="grid w-12 place-items-center rounded-xl border border-line hover:bg-surface-2">
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <p className="mt-2 text-xs text-ink-3">
              Turns on real AI: syllabus and PDF reading, web-researched quizzes, and the blunt review. Get a key at{" "}
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="underline">console.anthropic.com</a>.
              It's stored only in this browser and sent only to Anthropic. Usage is billed to your key, so don't save it on a shared computer.
            </p>
          </div>

          <fieldset>
            <legend className="mb-1 text-sm font-medium text-ink-2">Model</legend>
            <div className="space-y-2">
              {MODELS.map((m) => (
                <label key={m.id} className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm ${model === m.id ? "border-ink bg-surface-2" : "border-line"}`}>
                  <span className="flex items-center gap-3">
                    <input type="radio" name="model" value={m.id} checked={model === m.id} onChange={() => setModel(m.id)} className="accent-current" />
                    <span className="font-medium">{m.label}</span>
                  </span>
                  <span className="text-xs text-ink-3">{m.note}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {error && <p role="alert" className="text-sm text-bad">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

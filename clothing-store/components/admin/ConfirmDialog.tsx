"use client";

import { useEffect, useRef } from "react";

export default function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  text: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => { e.preventDefault(); onCancel(); }}
      className="w-[min(92vw,26rem)] rounded-3xl border border-surface-strong bg-surface p-0 text-ink shadow-lift backdrop:bg-black/70"
    >
      <div className="p-6">
        <h2 className="text-2xl">{title}</h2>
        <p className="mt-2 text-base leading-relaxed text-ink/80">{text}</p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
          <button type="button" onClick={onCancel} disabled={busy} className="h-14 flex-1 rounded-full border border-surface-strong text-base font-medium text-ink-deep">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className="h-14 flex-1 rounded-full bg-primary text-base font-semibold text-canvas disabled:opacity-50">
            {busy ? "Please wait…" : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}

"use client";

/** Big on/off switch with its label, 48px+ tap target. */
export default function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-2xl px-3 text-left text-base text-ink-deep transition active:bg-surface-strong disabled:opacity-50"
    >
      <span>{label}</span>
      <span className={`relative h-8 w-14 shrink-0 rounded-full transition-colors duration-200 ${checked ? "bg-primary" : "bg-surface-strong"}`}>
        <span
          className={`absolute top-1 h-6 w-6 rounded-full shadow transition-all duration-200 ${checked ? "left-7 bg-canvas" : "left-1 bg-ink/70"}`}
        />
      </span>
    </button>
  );
}

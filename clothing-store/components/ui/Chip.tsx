"use client";

/** Large, tappable toggle chip used for sizes, colours and filters. */
export default function Chip({
  selected,
  onClick,
  children,
  disabled = false,
  className = "",
  ariaLabel,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={ariaLabel}
      className={`inline-flex min-h-[48px] min-w-[48px] items-center justify-center gap-2 rounded-full border px-4 text-[15px] font-medium transition-all duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 ${
        selected
          ? "border-primary bg-primary text-canvas"
          : "border-surface-strong bg-surface text-ink-deep hover:border-accent"
      } ${className}`}
    >
      {children}
    </button>
  );
}

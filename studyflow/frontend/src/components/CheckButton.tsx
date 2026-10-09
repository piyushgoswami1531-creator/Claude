import { AnimatePresence, motion } from "framer-motion";

interface Props {
  checked: boolean;
  onToggle: () => void;
  color?: string;
  disabled?: boolean;
  label: string;
}

/** Circular checkbox: fills with a pop and draws its checkmark. */
export function CheckButton({ checked, onToggle, color = "var(--ink)", disabled, label }: Props) {
  return (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      whileTap={{ scale: 0.82 }}
      className="relative grid size-9 shrink-0 place-items-center rounded-full disabled:cursor-not-allowed disabled:opacity-40"
    >
      <motion.span
        className="absolute inset-0 rounded-full border-2"
        animate={{
          borderColor: checked ? color : "var(--line)",
          backgroundColor: checked ? color : "rgba(0,0,0,0)",
          scale: checked ? [1, 1.18, 1] : 1,
        }}
        transition={{ duration: 0.35 }}
      />
      <AnimatePresence>
        {checked && (
          <motion.span
            key="burst"
            className="absolute inset-0 rounded-full border-2"
            style={{ borderColor: color }}
            initial={{ scale: 1, opacity: 0.6 }}
            animate={{ scale: 1.9, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>
      <svg viewBox="0 0 24 24" className="relative size-5">
        <motion.path
          d="M5 12.5l4.5 4.5L19 7.5"
          fill="none"
          stroke="white"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
          transition={{ duration: 0.3, delay: checked ? 0.08 : 0 }}
        />
      </svg>
    </motion.button>
  );
}

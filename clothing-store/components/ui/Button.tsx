import Link from "next/link";

type Variant = "primary" | "outline" | "ghost" | "light";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-canvas shadow-soft hover:bg-primary-hover hover:shadow-lift",
  outline: "border border-primary/40 text-ink-deep hover:border-primary hover:bg-surface",
  ghost: "text-ink-deep hover:bg-surface",
  light: "bg-canvas text-ink-deep shadow-soft hover:bg-surface",
};

export const buttonClass = (variant: Variant = "primary", extra = "") =>
  `inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full px-6 text-base font-medium transition-all duration-300 active:scale-[0.98] ${variants[variant]} ${extra}`;

type Props = {
  href: string;
  variant?: Variant;
  className?: string;
  children: React.ReactNode;
  external?: boolean;
};

export default function ButtonLink({ href, variant = "primary", className = "", children, external }: Props) {
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={buttonClass(variant, className)}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={buttonClass(variant, className)}>
      {children}
    </Link>
  );
}

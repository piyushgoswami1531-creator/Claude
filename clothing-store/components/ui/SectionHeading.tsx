import Link from "next/link";
import { ArrowRightIcon } from "@/components/ui/icons";

export default function SectionHeading({
  eyebrow,
  title,
  href,
  linkLabel = "View all",
}: {
  eyebrow?: string;
  title: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-8 flex items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h2 className="text-3xl md:text-4xl">{title}</h2>
      </div>
      {href && (
        <Link
          href={href}
          className="group inline-flex min-h-[48px] shrink-0 items-center gap-1.5 text-sm font-medium text-primary hover:text-primary-hover"
        >
          {linkLabel}
          <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      )}
    </div>
  );
}

import Image from "next/image";
import Link from "next/link";
import { siteConfig } from "@/lib/siteConfig";

/** Shows the logo image once siteConfig.logo is set; a serif wordmark until then. */
export default function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className="flex min-h-[48px] items-center gap-3" aria-label={`${siteConfig.name} home`}>
      {siteConfig.logo ? (
        <Image src={siteConfig.logo} alt={siteConfig.name} width={140} height={48} className="h-10 w-auto" priority />
      ) : (
        <>
          <span
            className={`grid h-10 w-10 place-items-center rounded-full border font-serif text-lg ${
              light ? "border-canvas/40 text-canvas" : "border-primary/40 text-primary"
            }`}
            aria-hidden
          >
            {siteConfig.name.replace(/[^A-Za-z]/g, "").charAt(0) || "S"}
          </span>
          <span className={`font-serif text-xl tracking-wide ${light ? "text-canvas" : "text-ink-deep"}`}>
            {siteConfig.name}
          </span>
        </>
      )}
    </Link>
  );
}

import { swatchFor } from "@/lib/colours";

export default function Swatch({ name, size = 18 }: { name: string; size?: number }) {
  const hex = swatchFor(name);
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full ring-1 ring-inset ring-white/25"
      style={{
        width: size,
        height: size,
        background: hex ?? "conic-gradient(#737373 0 25%, #A3A3A3 0 50%, #737373 0 75%, #A3A3A3 0)",
      }}
    />
  );
}

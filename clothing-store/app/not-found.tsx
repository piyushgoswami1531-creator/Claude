import ButtonLink from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="container flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <p className="eyebrow mb-3">404</p>
      <h1 className="text-4xl md:text-5xl">We couldn&apos;t find that page</h1>
      <p className="mt-3 max-w-md text-ink/70">It may have sold out or moved. Have a look around the shop instead.</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <ButtonLink href="/shop">Browse the shop</ButtonLink>
        <ButtonLink href="/" variant="outline">Go home</ButtonLink>
      </div>
    </div>
  );
}

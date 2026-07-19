/**
 * Presentational greeting: a centered stack — the date as a small serif eyebrow
 * above the display-face greeting. Keeps the hero balanced for any greeting
 * length (with the subline below it, the greeting sits between two quiet muted
 * lines) instead of a wide title with the date floating off to one side.
 */
export function DashboardGreeting({ greeting, date }: { greeting: string; date: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="font-serif text-sm text-muted-foreground sm:text-base">{date}</p>
      <h1 className="font-heading text-4xl font-semibold tracking-tight text-balance text-foreground sm:text-5xl">
        {greeting}
      </h1>
    </div>
  );
}

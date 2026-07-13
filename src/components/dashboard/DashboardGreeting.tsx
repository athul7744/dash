/**
 * Presentational greeting. Greeting + date read as one line on desktop
 * (stacked on mobile), differentiated by face/weight: the greeting is the
 * display face, the date a lighter muted serif.
 */
export function DashboardGreeting({ greeting, date }: { greeting: string; date: string }) {
  return (
    <div className="flex flex-col items-center gap-1 sm:flex-row sm:items-baseline sm:gap-3">
      <h1 className="font-heading text-4xl font-semibold tracking-tight text-balance text-foreground sm:text-5xl">
        {greeting}
      </h1>
      <p className="font-serif text-base text-muted-foreground sm:text-lg">{date}</p>
    </div>
  );
}

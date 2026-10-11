// The WHOOP-style dial: a thick rounded arc on a quiet track, the number in
// the middle. `fraction` is 0–1 of the dial's own scale (recovery %, strain /21,
// sleep performance %); the label underneath carries the meaning, never the
// colour alone.

export function Ring({
  fraction,
  color,
  value,
  unit,
  label,
  caption,
}: {
  fraction: number | null;
  color: string;
  value: string;
  unit?: string;
  label: string;
  caption: React.ReactNode;
}) {
  const size = 132;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = fraction === null ? 0 : Math.min(1, Math.max(0, fraction));

  return (
    <figure className="flex min-w-0 flex-col items-center gap-2 rounded-2xl bg-[var(--wd-card)] px-2 py-4 sm:gap-3 sm:px-4 sm:py-5">
      <div className="relative aspect-square w-full max-w-[132px]">
        <svg aria-hidden className="size-full" viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} fill="none" r={r} stroke="var(--wd-track)" strokeWidth={stroke} />
          {fraction !== null ? (
            <circle
              cx={size / 2}
              cy={size / 2}
              fill="none"
              r={r}
              stroke={color}
              strokeDasharray={`${circumference * clamped} ${circumference}`}
              strokeLinecap="round"
              strokeWidth={stroke}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          ) : null}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{value}</span>
          {unit ? <span className="text-[11px] text-[var(--wd-muted)]">{unit}</span> : null}
        </div>
      </div>
      <figcaption className="flex flex-col items-center gap-0.5 text-center">
        <span className="text-[11px] font-semibold tracking-[0.14em] text-[var(--wd-muted)] uppercase">{label}</span>
        <span className="text-[11px] text-[var(--wd-ink)] sm:text-xs">{caption}</span>
      </figcaption>
    </figure>
  );
}

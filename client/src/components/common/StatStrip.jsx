import { cn } from '../../utils/cn.js';

const COLUMNS = {
  3: 'grid-cols-3',
  4: 'grid-cols-2 xl:grid-cols-4',
};

// A single hairline strip instead of a row of floating cards. The gap exposes the
// divider colour, which keeps the grid readable when four stats wrap to two rows.
export default function StatStrip({ stats, columns = 3, className }) {
  return (
    <dl
      className={cn(
        'grid gap-px overflow-hidden rounded-xl border border-line bg-line-soft',
        COLUMNS[columns] ?? COLUMNS[3],
        className,
      )}
    >
      {stats.map(({ key, label, value, caption, icon: Icon, tint, valueClass }) => (
        <div key={key} className="min-w-0 bg-surface px-3 py-4 sm:px-5 sm:py-5">
          <dt className="flex items-center gap-2">
            <span
              className={cn(
                'hidden h-8 w-8 shrink-0 items-center justify-center rounded-md sm:flex',
                tint,
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="eyebrow truncate">{label}</span>
          </dt>
          <dd
            className={cn(
              'mt-1.5 font-display text-2xl font-extrabold tabular-nums tracking-tight sm:mt-2 sm:text-3xl',
              valueClass,
            )}
          >
            {value}
          </dd>
          {caption && (
            <dd className="mt-1 hidden text-xs leading-relaxed text-muted md:block">{caption}</dd>
          )}
        </div>
      ))}
    </dl>
  );
}

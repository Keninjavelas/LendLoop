import { cn } from '../../utils/cn.js';
import { priorityLabel } from '../../utils/constants.js';

// Static class strings only - Tailwind scans source for literal values, so these cannot be
// composed dynamically from the priority name.
// Low stays neutral on purpose: only medium and high are allowed to carry colour, so a
// high-priority entry is the loudest thing on the card rather than one of three hues.
const STYLES = {
  low: 'bg-raised text-muted ring-line',
  medium: 'bg-pending-soft text-pending ring-pending/25',
  high: 'bg-danger-soft text-danger ring-danger/25',
};

const DOTS = {
  low: 'bg-faint',
  medium: 'bg-pending',
  high: 'bg-danger',
};

export default function PriorityBadge({ priority, source, className, dot = true }) {
  const key = String(priority ?? '').toLowerCase();

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset',
        STYLES[key] ?? STYLES.low,
        className,
      )}
      title={
        source === 'category'
          ? 'Following the category default'
          : source === 'manual'
            ? 'Set manually for this entry'
            : undefined
      }
    >
      {dot && (
        <span className={cn('h-1.5 w-1.5 rounded-full', DOTS[key] ?? DOTS.low)} aria-hidden="true" />
      )}
      {priorityLabel(key)}
    </span>
  );
}

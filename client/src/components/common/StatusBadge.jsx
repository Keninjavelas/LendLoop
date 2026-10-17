import { cn } from '../../utils/cn.js';

// Static class strings only - Tailwind scans for literal values, so these cannot
// be composed dynamically from the status name.
const STYLES = {
  available: 'bg-success-soft text-success ring-success/25',
  borrowed: 'bg-info-soft text-info ring-info/25',
  archived: 'bg-raised text-muted ring-line',
  pending: 'bg-pending-soft text-pending ring-pending/25',
  approved: 'bg-success-soft text-success ring-success/25',
  rejected: 'bg-danger-soft text-danger ring-danger/25',
  cancelled: 'bg-raised text-muted ring-line',
  active: 'bg-info-soft text-info ring-info/25',
  returned: 'bg-success-soft text-success ring-success/25',
  overdue: 'bg-danger-soft text-danger ring-danger/25',
  // Reminder-log delivery states. Only `sent` means a message actually left the
  // process: `preview` was rendered locally, and `link` still needs the lender to
  // click through, so neither is allowed to borrow the success colour.
  sent: 'bg-success-soft text-success ring-success/25',
  preview: 'bg-info-soft text-info ring-info/25',
  link: 'bg-pending-soft text-pending ring-pending/25',
  failed: 'bg-danger-soft text-danger ring-danger/25',
};

const DOTS = {
  available: 'bg-success',
  borrowed: 'bg-info',
  archived: 'bg-faint',
  pending: 'bg-pending',
  approved: 'bg-success',
  rejected: 'bg-danger',
  cancelled: 'bg-faint',
  active: 'bg-info',
  returned: 'bg-success',
  overdue: 'bg-danger',
  sent: 'bg-success',
  preview: 'bg-info',
  link: 'bg-pending',
  failed: 'bg-danger',
};

export function statusLabel(status) {
  return String(status ?? '').charAt(0).toUpperCase() + String(status ?? '').slice(1);
}

export default function StatusBadge({ status, label, className, dot = true }) {
  const key = String(status ?? '').toLowerCase();
  const tone = STYLES[key] ?? STYLES.archived;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset',
        tone,
        className,
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', DOTS[key] ?? DOTS.archived)} aria-hidden="true" />}
      {label ?? statusLabel(key)}
    </span>
  );
}

import { cn } from '../../utils/cn.js';

export default function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-surface/40 px-6 py-10 text-center sm:py-12',
        className,
      )}
    >
      {Icon && (
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Icon className="h-7 w-7" aria-hidden="true" />
        </span>
      )}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

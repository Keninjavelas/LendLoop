import { cn } from '../../utils/cn.js';

// `cn` joins strings without merging, so two classes that set the same property
// resolve by stylesheet order rather than by the order written here. Every exported
// field class therefore states exactly one border, one background and one focus ring,
// and variants are built by swapping whole strings instead of appending overrides.
const FIELD_BASE =
  'w-full rounded-lg border py-2.5 text-sm text-ink placeholder:text-faint transition-colors focus:outline-none disabled:cursor-not-allowed disabled:bg-surface disabled:text-muted';

const RING = 'focus:ring-2 focus:ring-primary/20';
const RING_DANGER = 'focus:ring-2 focus:ring-danger/20';

const PADDING = 'px-3.5';
// Room for a control that lives inside the field's right edge, such as a password reveal.
const PADDING_TRAILING = 'pl-3.5 pr-11';

export const FIELD_CLASS = `${FIELD_BASE} ${RING} ${PADDING} border-line bg-raised focus:border-primary`;

// Read-only fields are not interactive, so they carry no focus ring at all.
export const READONLY_FIELD_CLASS = `${FIELD_BASE} ${PADDING} border-line-soft bg-surface text-muted`;

export function fieldClass(error, { trailing = false } = {}) {
  const padding = trailing ? PADDING_TRAILING : PADDING;
  return error
    ? `${FIELD_BASE} ${RING_DANGER} ${padding} border-danger bg-raised focus:border-danger`
    : `${FIELD_BASE} ${RING} ${padding} border-line bg-raised focus:border-primary`;
}

export const LABEL_CLASS = 'mb-1.5 block text-sm font-semibold text-ink';

export function Field({ id, label, hint, error, optional, children, className }) {
  return (
    <div className={className}>
      <label className={LABEL_CLASS} htmlFor={id}>
        {label}
        {optional && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-danger">{error}</p>
      ) : (
        hint && <p className="mt-1.5 text-xs leading-relaxed text-muted">{hint}</p>
      )}
    </div>
  );
}

export function FormSection({ title, description, children, className }) {
  return (
    <section className={cn('rounded-xl border border-line-soft bg-canvas/50 p-4', className)}>
      <h3 className="text-sm font-bold text-ink">{title}</h3>
      {description && <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function CheckRow({ checked, onChange, title, description, disabled, id }) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-3 transition-colors',
        checked ? 'border-primary/45 bg-primary-soft' : 'border-line bg-raised hover:border-faint',
        disabled && 'cursor-not-allowed opacity-45',
      )}
    >
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
        checked={Boolean(checked)}
        onChange={onChange}
        disabled={disabled}
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        {description && <span className="mt-0.5 block text-xs leading-relaxed text-muted">{description}</span>}
      </span>
    </label>
  );
}

export function RadioRow({ name, value, checked, onChange, title, description, disabled }) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-3 transition-colors',
        checked ? 'border-primary/45 bg-primary-soft' : 'border-line bg-raised hover:border-faint',
        disabled && 'cursor-not-allowed opacity-45',
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        {description && <span className="mt-0.5 block text-xs leading-relaxed text-muted">{description}</span>}
      </span>
    </label>
  );
}

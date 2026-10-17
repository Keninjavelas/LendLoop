import { Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn.js';

// One solid accent per view is the rule, so `primary` is the only filled green.
// `success` confirms or completes something and stays tinted rather than competing
// with the call to action next to it.
const VARIANTS = {
  primary: 'bg-primary text-primary-ink hover:bg-primary-hover',
  secondary: 'border border-line bg-raised text-ink hover:border-faint hover:bg-line-soft',
  ghost: 'text-muted hover:bg-raised hover:text-ink',
  danger: 'bg-danger text-canvas hover:bg-danger/85',
  success: 'border border-success/35 bg-success-soft text-success hover:bg-success/15',
};

const SIZES = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
  icon: 'h-10 w-10',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-semibold transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

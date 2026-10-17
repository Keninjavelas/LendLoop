import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../utils/cn.js';

const SIZES = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableWithin(root) {
  if (!root) return [];
  return [...root.querySelectorAll(FOCUSABLE)].filter(
    (element) => element.getClientRects().length > 0 && !element.closest('[aria-hidden="true"]'),
  );
}

export default function Modal({ open, onClose, title, description, children, footer, size = 'md' }) {
  const dialogRef = useRef(null);
  const bodyRef = useRef(null);
  const closeRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;

    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement;

    // Focus the first control in the body where there is one; confirmation dialogs
    // without a field fall back to the close button, then the dialog itself.
    const frame = window.requestAnimationFrame(() => {
      const target =
        focusableWithin(bodyRef.current)[0] ?? focusableWithin(dialog)[0] ?? dialog;
      target?.focus();
    });

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = focusableWithin(dialog);
      if (items.length === 0) {
        event.preventDefault();
        dialog?.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const outside = !dialog?.contains(active);

      if (event.shiftKey && (active === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-canvas/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* A bottom sheet on mobile and a centred dialog above it. Header and footer stay
          put while only the body scrolls, so a long form never loses its actions. */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[92vh] w-full flex-col overflow-hidden border border-line bg-surface outline-none',
          'rounded-t-xl sm:max-h-[90vh] sm:rounded-xl',
          SIZES[size],
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-bold text-ink">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="-mr-1.5 rounded-lg p-1.5 text-muted transition-colors hover:bg-raised hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>

        {footer && (
          <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-line px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

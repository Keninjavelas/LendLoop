import { Check } from 'lucide-react';
import { cn } from '../../../utils/cn.js';

export default function EntryStepper({ steps, currentIndex, onSelect, disabled = false }) {
  return (
    <nav aria-label="Lending entry steps" className="panel p-1.5">
      <ol className="grid grid-cols-5 gap-1">
        {steps.map((step, index) => {
          const current = index === currentIndex;
          const complete = index < currentIndex;
          const future = index > currentIndex;

          return (
            <li key={step.id} className="min-w-0">
              <button
                type="button"
                onClick={() => onSelect(index)}
                disabled={future || disabled}
                aria-current={current ? 'step' : undefined}
                aria-label={`Step ${index + 1} of ${steps.length}: ${step.title}${complete ? ' (completed)' : ''}`}
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-lg px-2 py-2.5 text-left transition-colors sm:justify-start sm:px-3',
                  current
                    ? 'bg-primary-soft ring-1 ring-inset ring-primary/25'
                    : complete
                      ? 'hover:bg-raised'
                      : 'opacity-45',
                )}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums',
                    current
                      ? 'bg-primary text-primary-ink'
                      : complete
                        ? 'bg-primary-soft text-primary'
                        : 'bg-raised text-faint ring-1 ring-inset ring-line',
                  )}
                >
                  {complete ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
                </span>
                <span
                  className={cn(
                    'hidden truncate text-xs font-semibold sm:block',
                    current ? 'text-primary' : complete ? 'text-ink' : 'text-faint',
                  )}
                >
                  {step.title}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

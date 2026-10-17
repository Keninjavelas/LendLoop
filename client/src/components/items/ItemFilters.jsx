import { Search, SlidersHorizontal } from 'lucide-react';
import { cn } from '../../utils/cn.js';

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'border border-primary bg-primary text-primary-ink hover:bg-primary-hover'
          : 'border border-line bg-raised text-muted hover:border-faint hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

export default function ItemFilters({
  search,
  onSearchChange,
  category,
  onCategoryChange,
  categories = [],
  onlyAvailable,
  onOnlyAvailableChange,
  resultCount,
}) {
  return (
    <div className="space-y-4">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-faint"
          aria-hidden="true"
        />
        {/* FIELD_CLASS cannot be reused here: the leading icon needs pl-11, and appending
            padding utilities to it would resolve by stylesheet order rather than by intent. */}
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by title or description..."
          aria-label="Search items"
          className="w-full rounded-lg border border-line bg-raised py-3 pl-11 pr-4 text-sm text-ink placeholder:text-faint transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Chip active={!category} onClick={() => onCategoryChange('')}>
          All categories
        </Chip>
        {categories.map((entry) => (
          <Chip
            key={entry._id}
            active={category === entry._id}
            onClick={() => onCategoryChange(category === entry._id ? '' : entry._id)}
          >
            {entry.name}
            <span
              className={cn(
                'ml-1.5 text-xs',
                category === entry._id ? 'text-primary-ink/70' : 'text-muted',
              )}
            >
              {entry.count}
            </span>
          </Chip>
        ))}
      </div>

      <div className="panel flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-ink">
          <input
            type="checkbox"
            checked={onlyAvailable}
            onChange={(event) => onOnlyAvailableChange(event.target.checked)}
            className="h-4 w-4 shrink-0 accent-primary"
          />
          <SlidersHorizontal className="h-4 w-4 text-muted" aria-hidden="true" />
          Available to borrow now
        </label>
        {typeof resultCount === 'number' && (
          <span className="text-sm text-muted">
            {resultCount} {resultCount === 1 ? 'item' : 'items'}
          </span>
        )}
      </div>
    </div>
  );
}

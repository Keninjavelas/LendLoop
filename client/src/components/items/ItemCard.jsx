import {
  BookOpen,
  Boxes,
  Calculator,
  Laptop,
  Package,
  Shirt,
  Wallet,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import StatusBadge from '../common/StatusBadge.jsx';

export const CATEGORY_ICONS = {
  'Books & Notes': BookOpen,
  Electronics: Laptop,
  Calculators: Calculator,
  'Money / Valuables': Wallet,
  Accessories: Shirt,
  Other: Package,
};

export function CategoryIcon({ category, className }) {
  const Icon = CATEGORY_ICONS[category] ?? Boxes;
  return <Icon className={className} aria-hidden="true" />;
}

export default function ItemCard({ item, actions, footer }) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(item.imageUrl) && !imageFailed;

  return (
    <article className="group panel flex flex-col overflow-hidden transition-colors hover:border-faint">
      <Link
        to={`/items/${item._id}`}
        className="relative block aspect-[4/3] overflow-hidden bg-raised"
      >
        {showImage ? (
          <img
            src={item.imageUrl}
            alt={item.title}
            loading="lazy"
            onError={() => setImageFailed(true)}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-primary-soft text-primary">
            <CategoryIcon category={item.categoryId?.name} className="h-12 w-12" />
          </span>
        )}
        <span className="absolute right-3 top-3">
          <StatusBadge status={item.status} />
        </span>
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <Link to={`/items/${item._id}`} className="line-clamp-1 font-semibold text-ink hover:text-primary">
          {item.title}
        </Link>
        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">{item.description}</p>

        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {item.categoryId?.name && (
            <span className="rounded-md bg-raised px-2 py-0.5 font-medium ring-1 ring-inset ring-line">
              {item.categoryId.name}
            </span>
          )}
          <span className="rounded-md bg-raised px-2 py-0.5 font-medium ring-1 ring-inset ring-line">
            {item.condition}
          </span>
          {item.ownerId?.name && (
            <span className="ml-auto truncate font-medium">by {item.ownerId.name}</span>
          )}
        </div>

        {footer && <div className="mt-3">{footer}</div>}
        {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </article>
  );
}

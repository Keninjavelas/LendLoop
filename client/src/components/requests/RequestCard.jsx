import { CalendarClock, MessageSquare, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDate, timeAgo } from '../../utils/formatDate.js';
import Button from '../common/Button.jsx';
import StatusBadge from '../common/StatusBadge.jsx';
import { CategoryIcon } from '../items/ItemCard.jsx';

export default function RequestCard({ request, direction, onApprove, onReject, onCancel, busy = false }) {
  const item = request.itemId;
  const counterparty = direction === 'incoming' ? request.borrowerId : request.ownerId;
  const isPending = request.status === 'pending';

  return (
    <article className="panel p-4 transition-colors hover:border-faint sm:p-5">
      <div className="flex gap-4">
        <Link
          to={item ? `/items/${item._id}` : '#'}
          aria-label={item ? item.title : 'Item removed'}
          className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary-soft text-primary"
        >
          {item?.imageUrl ? (
            <img src={item.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <CategoryIcon category={item?.categoryId?.name} className="h-7 w-7" />
          )}
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <Link
                to={item ? `/items/${item._id}` : '#'}
                className="line-clamp-1 font-semibold text-ink hover:text-primary"
              >
                {item?.title ?? 'Item no longer available'}
              </Link>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
                <User className="h-3.5 w-3.5" aria-hidden="true" />
                {direction === 'incoming' ? 'Requested by ' : 'Requested from '}
                <span className="font-medium text-ink">{counterparty?.name ?? 'Unknown user'}</span>
              </p>
            </div>
            <StatusBadge status={request.status} />
          </div>

          {request.message && (
            <p className="mt-3 flex gap-2 rounded-lg border border-line-soft bg-raised px-3 py-2 text-sm leading-relaxed text-muted">
              <MessageSquare className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="line-clamp-3">{request.message}</span>
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
              Return by {formatDate(request.requestedReturnDate)}
            </span>
            <span>{timeAgo(request.createdAt)}</span>
          </div>
        </div>
      </div>

      {isPending && (
        <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          {direction === 'incoming' ? (
            <>
              <Button variant="secondary" size="sm" onClick={onReject} disabled={busy}>
                Reject
              </Button>
              <Button variant="success" size="sm" onClick={onApprove} loading={busy}>
                Approve
              </Button>
            </>
          ) : (
            <Button variant="secondary" size="sm" onClick={onCancel} loading={busy}>
              Cancel request
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
